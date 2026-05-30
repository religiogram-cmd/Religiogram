import {
  ServiceUnavailableException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConsultationSession, SessionStatus, SessionType } from './entities/consultation-session.entity';
import { SessionBillingTick } from './entities/session-billing-tick.entity';
import { ProviderEntity, ProviderStatus } from '../service-providers/entities/provider.entity';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { randomUUID } from 'crypto';
import { ConsultationBillingService } from './consultation-billing.service';
import { RedisService } from '../redis/redis.service';

export enum PlanType {
  INTRO_5    = 'intro_5',
  PACK_20    = 'pack_20',
  PACK_30    = 'pack_30',
  PER_MINUTE = 'per_minute',
}

const PLAN_PRICE: Record<PlanType, number | null> = {
  [PlanType.INTRO_5]:    2_900,
  [PlanType.PACK_20]:   29_900,
  [PlanType.PACK_30]:   49_900,
  [PlanType.PER_MINUTE]: null, // computed from provider rate × 5 min pre-auth
};

const PLAN_MINUTES: Record<PlanType, number> = {
  [PlanType.INTRO_5]:     5,
  [PlanType.PACK_20]:    20,
  [PlanType.PACK_30]:    30,
  [PlanType.PER_MINUTE]:  5, // 5-minute pre-auth block
};

const CASHBACK_PAISE    = 5_000; // INR 50
const CASHBACK_MAX_SESSIONS = 2; // first 2 sessions eligible

@Injectable()
export class ConsultationIntroService {
  private readonly logger = new Logger(ConsultationIntroService.name);

  constructor(
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    @InjectRepository(SessionBillingTick)
    private readonly ticks: Repository<SessionBillingTick>,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    private readonly wallet: WalletService,
    private readonly notifs: NotificationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly billingService: ConsultationBillingService,
    private readonly redis: RedisService,
  ) {}

  /* ─── POST /v1/consultations/start ─── */
  async startSession(
    userId: string,
    providerId: string,
    planType: PlanType,
  ): Promise<{
    sessionId: string;
    holdAmountPaise: number;
    perMinutePaise: number;
    introPaise: number;
    introMinutes: number;
    cashbackEligible: boolean;
  }> {
    // 1. Look up provider
    const provider = await this.providers.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.status !== ProviderStatus.Approved) {
      throw new BadRequestException('Provider is not available');
    }

    const providerPerMinute: number = (provider as unknown as { perMinutePaise: number | null }).perMinutePaise ?? 1_500;

    // 2. Calculate plan price
    let holdAmountPaise: number;
    if (planType === PlanType.PER_MINUTE) {
      holdAmountPaise = providerPerMinute * 5;
    } else {
      holdAmountPaise = PLAN_PRICE[planType]!;
    }
    const introMinutes  = PLAN_MINUTES[planType];
    const introPaise    = holdAmountPaise;

    // 3. (pre-check removed — WalletService.hold() is race-safe inside a transaction)

    // 4. Duplicate active-session guard — prevents double-tap holds
    const existing = await this.sessions.findOne({
      where: { userId, providerId, sessionStatus: SessionStatus.REQUESTED },
    });
    if (existing) {
      throw new BadRequestException('An active session request already exists for this provider');
    }

    // 5. Hold wallet amount + create session (with compensating release on failure)
    const sessionId = randomUUID();
    await this.wallet.hold(userId, holdAmountPaise, sessionId, 'consultation_intro');

    try {
      // 6. Create ConsultationSession row
      const session = this.sessions.create({
        id:             sessionId,
        sessionCode:    `CI-${Date.now().toString(36).toUpperCase()}`,
        userId,
        providerId,
        serviceId:      'CONSULTATION_INTRO', // sentinel: intro sessions are not tied to a catalog SKU
        sessionType:    SessionType.AUDIO,
        sessionStatus:  SessionStatus.REQUESTED,
        ratePerMinute:  providerPerMinute,
        minimumChargePaise: introPaise,
        totalCharge:    0,
      });
      await this.sessions.save(session);
    } catch (saveErr) {
      // Compensate: release the hold immediately so funds are not stuck
      await this.wallet.releaseHoldByReference(sessionId).catch((e: Error) =>
        this.logger.error(`Failed to release hold after session save failure: ${e.message}`, e.stack),
      );
      throw saveErr;
    }

    // 7. Check cashback eligibility (< CASHBACK_MAX_SESSIONS completed sessions)
    const cashbackEligible = await this.isCashbackEligible(userId);

    return {
      sessionId,
      holdAmountPaise,
      perMinutePaise: providerPerMinute,
      introPaise,
      introMinutes,
      cashbackEligible,
    };
  }

  /* ─── POST /v1/consultations/:id/end ─── */
  async endSession(
    sessionId: string,
    userId: string,
  ): Promise<{
    totalMinutes: number;
    totalCharged: number;
    surplusRefundedPaise: number;
    cashbackAdded: number;
  }> {
    // 1. Find session (outside TX — read-only pre-check)
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    // 2. Stop billing FIRST so all ticks are committed before we count them.
    //    Retry up to 3 times — if the billing job cannot be stopped we must NOT proceed:
    //    the tick count in step 3 would be incomplete, causing provider/user payment divergence.
    {
      const STOP_RETRIES = 3;
      let stopError: Error | undefined;
      for (let attempt = 1; attempt <= STOP_RETRIES; attempt++) {
        try {
          await this.billingService.stopBilling(sessionId);
          stopError = undefined;
          break;
        } catch (err) {
          stopError = err as Error;
          this.logger.warn({ err, sessionId, attempt }, `stopBilling attempt ${attempt} failed`);
          if (attempt < STOP_RETRIES) {
            // Exponential backoff: 200ms, 400ms
            await new Promise<void>(r => setTimeout(r, attempt * 200));
          }
        }
      }
      if (stopError) {
        // Surface a retriable error — the hold is still active, no money has moved
        throw new ServiceUnavailableException(
          'Billing stop failed — please retry ending the session in a few seconds',
        );
      }
    }

    // 3. NOW read the final tick count (all ticks are now in DB)
    const tickRows = await this.ticks.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    const totalMinutes = tickRows.length;
    const totalCharged = tickRows.reduce((sum, t) => sum + Number(t.amountPaise), 0);
    const holdAmount   = Number(session.minimumChargePaise);
    const surplus      = Math.max(0, holdAmount - totalCharged);

    // 4. Atomic money path: mark session ENDED + capture hold + credit provider + credit surplus.
    //    All four steps share one DB transaction so a mid-flight crash leaves the DB consistent.
    let cashbackAdded = 0;
    await this.dataSource.transaction(async (em) => {
      // 4a. Mark session ended
      await em.update(
        ConsultationSession,
        { id: sessionId },
        { sessionStatus: SessionStatus.ENDED, totalCharge: totalCharged },
      );

      // 4b. Capture hold — mark wallet_hold as captured and debit the held column.
      //     We inline the SQL that captureHoldByReference() would do so all changes
      //     stay inside this single transaction.
      const holdRows = await em.query<{ id: string; wallet_id: string; amount: string }[]>(
        `UPDATE wallet_holds
            SET status = 'released', released_at = now()
          WHERE reference_id = $1 AND status = 'active'
          RETURNING id, wallet_id, amount`,
        [sessionId],
      );
      if (holdRows.length > 0) {
        const { wallet_id: walletId, amount: holdAmtStr } = holdRows[0];
        const holdAmt = Number(holdAmtStr);
        // Debit held column; available is intentionally unchanged (funds consumed)
        await em.query(
          `UPDATE wallet_balances SET held = GREATEST(0, held - $1) WHERE wallet_id = $2`,
          [holdAmt, walletId],
        );
        await em.query(
          `UPDATE wallets SET held_balance = GREATEST(0, held_balance - $1) WHERE id = $2`,
          [holdAmt, walletId],
        );
        // Ledger entry for the capture
        await em.query(
          `INSERT INTO ledger_entries
             (id, wallet_id, entry_type, amount, direction, balance_after, reference_id,
              reference_type, idempotency_key, description, created_at)
           SELECT gen_random_uuid(), $1, 'debit', $2, -1,
                  (SELECT available FROM wallet_balances WHERE wallet_id = $1),
                  $3, 'CONSULTATION_CAPTURE', $4, 'Hold captured — payment consumed', now()
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [walletId, holdAmt, sessionId, `capture-hold-ref:${sessionId}`],
        );
      }

      // 4c. Credit provider wallet with the earned portion
      if (totalCharged > 0) {
        const providerWalletRows = await em.query<{ id: string }[]>(
          `SELECT id FROM wallets WHERE owner_type = 'provider' AND owner_id = $1 LIMIT 1`,
          [session.providerId],
        );
        if (providerWalletRows.length > 0) {
          const provWalletId = providerWalletRows[0].id;
          await em.query(
            `INSERT INTO ledger_entries
               (id, wallet_id, entry_type, amount, direction, balance_after, reference_id,
                reference_type, idempotency_key, description, created_at)
             SELECT gen_random_uuid(), $1, 'credit', $2, 1,
                    (SELECT available FROM wallet_balances WHERE wallet_id = $1) + $2,
                    $3, 'PROVIDER_CREDIT', $4,
                    $5, now()
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [
              provWalletId,
              totalCharged,
              sessionId,
              `provider-credit:${sessionId}`,
              `Consultation earnings for session ${sessionId}`,
            ],
          );
          await em.query(
            `UPDATE wallet_balances SET available = available + $1 WHERE wallet_id = $2`,
            [totalCharged, provWalletId],
          );
          await em.query(
            `UPDATE wallets SET available_balance = available_balance + $1 WHERE id = $2`,
            [totalCharged, provWalletId],
          );
        }
      }

      // 4d. Return surplus (pre-authorised funds not consumed) to user wallet
      if (surplus > 0) {
        const userWalletRows = await em.query<{ id: string }[]>(
          `SELECT id FROM wallets WHERE user_id = $1 LIMIT 1`,
          [session.userId],
        );
        if (userWalletRows.length > 0) {
          const userWalletId = userWalletRows[0].id;
          await em.query(
            `INSERT INTO ledger_entries
               (id, wallet_id, entry_type, amount, direction, balance_after, reference_id,
                reference_type, idempotency_key, description, created_at)
             SELECT gen_random_uuid(), $1, 'credit', $2, 1,
                    (SELECT available FROM wallet_balances WHERE wallet_id = $1) + $2,
                    $3, 'CONSULTATION_SURPLUS', $4,
                    $5, now()
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [
              userWalletId,
              surplus,
              sessionId,
              `surplus:${sessionId}`,
              `Surplus refund for consultation session ${sessionId}`,
            ],
          );
          await em.query(
            `UPDATE wallet_balances SET available = available + $1 WHERE wallet_id = $2`,
            [surplus, userWalletId],
          );
          await em.query(
            `UPDATE wallets SET available_balance = available_balance + $1 WHERE id = $2`,
            [surplus, userWalletId],
          );
        }
      }
    });

    // 5. Cashback OUTSIDE the DB transaction — atomic Redis NX lock prevents double-issue
    const cashbackEligible = await this.isCashbackEligible(userId);
    if (cashbackEligible) {
      try {
        await this.wallet.credit(userId, {
          amount:         CASHBACK_PAISE,
          description:    'First-session cashback',
          referenceId:    sessionId,
          referenceType:  'cashback',
          idempotencyKey: `cashback-${sessionId}`,
        });
        cashbackAdded = CASHBACK_PAISE;
      } catch (_) {
        // non-fatal: idempotent credit may already exist
      } finally {
        // Always release the lock so future sessions aren't blocked
        await this.releaseCashbackLock(userId);
      }
    }

    // 6. Notify user (outside TX — non-critical)
    await this.notifs.send(
      userId,
      NotificationType.CONSULTATION_ENDED,
      'Consultation ended',
      `Your session lasted ${totalMinutes} minute(s). Total charged: ₹${(totalCharged / 100).toFixed(2)}.`,
    );

    return {
      totalMinutes,
      totalCharged,
      surplusRefundedPaise: surplus,
      cashbackAdded,
    };
  }

  /* ── private: cashback eligibility — Redis NX lock prevents TOCTOU double-cashback ── */
  private async isCashbackEligible(userId: string): Promise<boolean> {
    // Step 1: Check count without lock (fast path – most users won't qualify)
    const completedCount = await this.sessions.count({
      where: { userId, sessionStatus: SessionStatus.ENDED },
    });
    if (completedCount >= CASHBACK_MAX_SESSIONS) return false;

    // Step 2: Acquire atomic NX lock — prevents concurrent endSession calls
    // from both seeing completedCount < MAX and both issuing cashback.
    // TTL 30s: long enough to cover the DB transaction; expires on crash.
    const lockKey = `cashback-lock:${userId}`;
    const acquired = await this.redis.setIfNotExists(lockKey, '1', 30);
    if (!acquired) {
      // Another request is already processing cashback for this user
      this.logger.warn(`Cashback lock already held for user ${userId} — skipping`);
      return false;
    }
    return true;
  }

  /** Release cashback lock after crediting (or on failure) */
  private async releaseCashbackLock(userId: string): Promise<void> {
    await this.redis.del(`cashback-lock:${userId}`);
  }

  /* ─── POST /v1/consultations/:id/extend ─── */
  async extendSession(
    sessionId: string,
    userId: string,
    opts: { extendMinutes?: number; upgradePlan?: 'pack_20' | 'pack_30' | 'per_minute'; idempotencyKey?: string },
  ) {
    // Load session directly — no broken priest relation needed
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Forbidden');

    // Load rate directly from provider (Fix I: ConsultationSession has no priest relation)
    const provider = await this.providers.findOne({ where: { id: session.providerId } });
    const providerRatePerMinute = Number(provider?.perMinutePaise ?? session.ratePerMinute ?? 200);

    // Calculate additional hold needed
    let additionalPaise = 0;
    if (opts.upgradePlan) {
      // Fix J: use module-level PLAN_PRICE instead of local shadowing constant
      const upgradePriceMap: Record<string, number> = {
        [PlanType.PACK_20]: PLAN_PRICE[PlanType.PACK_20]!,
        [PlanType.PACK_30]: PLAN_PRICE[PlanType.PACK_30]!,
      };
      const newPrice = upgradePriceMap[opts.upgradePlan] ?? 0;
      const alreadyPaid = Number(session.minimumChargePaise ?? 0);
      additionalPaise = Math.max(0, newPrice - alreadyPaid);
      // Update plan_type on session (stored in session_type column)
      await this.sessions.update({ id: session.id }, { planType: opts.upgradePlan });
    } else if (opts.extendMinutes) {
      // Use provider rate loaded directly above
      const extensionMinutes = opts.extendMinutes ?? 10;
      additionalPaise = providerRatePerMinute * extensionMinutes;
    }

    if (additionalPaise > 0) {
      // Use client-supplied idempotency key so retries after network failure don't
      // create duplicate holds.  Fall back to a random UUID for fire-and-forget callers.
      const idemKey = opts.idempotencyKey
        ? `ext-${opts.idempotencyKey}`   // namespaced to avoid collision with other hold types
        : `${sessionId}-ext-${randomUUID()}`;
      await this.wallet.hold(userId, additionalPaise, idemKey, 'consultation_extend');
    }

    return { sessionId, additionalHoldPaise: additionalPaise };
  }

  /* ─── GET /v1/consultations/:id ─── */
  async getSession(sessionId: string, userId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Forbidden');
    return {
      sessionId: session.id,
      planType: session.sessionType,
      introPaise: Number(session.minimumChargePaise ?? 0),
      perMinutePaise: Number(session.ratePerMinute ?? 0),
      cashbackEligible: false,
      cashbackIssued: false,
      createdAt: session.createdAt,
    };
  }

}
