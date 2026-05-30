import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { SessionBillingTick, TickStatus } from './entities/session-billing-tick.entity';
import { ConsultationSession, SessionStatus } from './entities/consultation-session.entity';
import { WalletService } from '../wallet/wallet.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { QUEUE } from '../common/queues/queue.constants';

interface RedisBillingState {
  userId: string;
  providerId: string;
  bookingId: string;
  pricePerMinPaise: string;
  startedAt: string;
  totalSeconds: string;
  lastTickAt: string;
}

const BILLING_TTL = 86_400;
// TICK_INTERVAL_MS is read from ConfigService at runtime so staging/test environments
// can use shorter intervals (e.g., BILLING_TICK_INTERVAL_MS=10000 for 10-second ticks)
// without a code change.  Default: 60_000 ms (1 minute) for production.
function getTickIntervalMs(config: import('@nestjs/config').ConfigService): number {
  const envMs = config.get<number>('consultation.tickIntervalMs');
  // Guard: minimum 5s to prevent runaway tight loops on misconfiguration
  return Math.max(5_000, envMs && envMs > 0 ? envMs : 60_000);
}
const BILLING_KEY = (sessionId: string) => `session:billing:${sessionId}`;
export const BILLING_TICK_JOB = 'billing-tick';

@Injectable()
export class ConsultationBillingService implements OnModuleInit {
  private readonly logger = new Logger(ConsultationBillingService.name);

  constructor(
    @InjectRepository(SessionBillingTick)
    private readonly ticks: Repository<SessionBillingTick>,
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    private readonly walletService: WalletService,
    private readonly events: EventEmitter2,
    private readonly redis: RedisService,
    private readonly notifs: NotificationsService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE.CONSULTATION_BILLING)
    private readonly billingQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // P1-2: On startup, re-queue BullMQ repeatable jobs for sessions that are
    // active in Redis. This handles pod restarts gracefully.
    this.logger.log('Scanning Redis for active billing sessions to resume');
    let resumed = 0;
    try {
      let cursor = '0';
      const allSessionIds: string[] = [];
      do {
        const keyPrefix = this.config.get<string>('redis.keyPrefix', 'rg:');
        const [nextCursor, keys] = await this.redis.getClient().scan(
          cursor, 'MATCH', `${keyPrefix}session:billing:*`, 'COUNT', 100,
        );
        cursor = nextCursor;
        for (const rawKey of keys) {
          const sessionId = this.sessionIdFromKey(rawKey);
          if (sessionId) {
            allSessionIds.push(sessionId);
          }
        }
      } while (cursor !== '0');

      // Process in parallel chunks of 50
      const CHUNK_SIZE = 50;
      for (let i = 0; i < allSessionIds.length; i += CHUNK_SIZE) {
        const chunk = allSessionIds.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(id => this.ensureRepeatableJob(id).catch(e =>
          this.logger.warn(`ensureRepeatableJob failed for ${id}: ${(e as Error).message}`)
        )));
        resumed += chunk.length;
      }
      this.logger.log(`onModuleInit: registered billing jobs for ${allSessionIds.length} sessions`);
    } catch (err: unknown) {
      this.logger.error(
        'Failed to resume billing sessions from Redis: ' + String((err as Error)?.message ?? err),
      );
    }

    // P1-3 Postgres fallback: if Redis was wiped but DB still has active sessions,
    // restore the Redis state so billing can continue without duplicate charges.
    try {
      // Recover ALL active sessions via keyset pagination — avoids missing records beyond 500
      let lastId: string | undefined;
      let batch: ConsultationSession[];
      do {
        const qb = this.sessions.createQueryBuilder('s')
          .where('s.sessionStatus = :status', { status: SessionStatus.ACTIVE })
          .orderBy('s.id', 'ASC')
          .take(100);
        if (lastId) qb.andWhere('s.id > :lastId', { lastId });
        batch = await qb.getMany();
        if (batch.length > 0) {
          lastId = batch[batch.length - 1].id;
        }
        for (const s of batch) {
          const key = BILLING_KEY(s.id);
          const exists = await this.redis.exists(key);
          if (!exists) {
            this.logger.warn(
              `Postgres fallback: restoring Redis billing state for session=${s.id}`,
            );
            await this.redis.getClient().hset(key, {
              userId: s.userId,
              providerId: s.providerId,
              bookingId: s.id,
              pricePerMinPaise: String(s.ratePerMinute),
              startedAt: s.startedAt?.toISOString() ?? new Date().toISOString(),
              totalSeconds: String(s.billableSeconds),
              lastTickAt: '',
            } satisfies RedisBillingState);
            await this.redis.expire(key, BILLING_TTL);
            await this.ensureRepeatableJob(s.id);
            resumed++;
          }
        }
      } while (batch.length === 100);
    } catch (err: unknown) {
      this.logger.error(
        'Postgres fallback scan failed: ' + String((err as Error)?.message ?? err),
      );
    }
  }

  async startBilling(
    sessionId: string,
    userId: string,
    providerId: string,
    bookingId: string,
    pricePerMinPaise: number,
  ): Promise<void> {
    const key = this.billingKey(sessionId);
    // Atomic check-and-set: only start billing if not already active for this session
    const isNew = await this.redis.getClient().hsetnx(key, 'userId', userId);
    if (!isNew) {
      this.logger.warn(`startBilling called but billing already active for ${sessionId}`);
      await this.ensureRepeatableJob(sessionId); // Ensure job exists even on duplicate call
      return;
    }

    // v9 (P0-3 safeguard): cap rate at text-only rate if voice/video is disabled.
    const voiceVideoEnabled = (this.config?.get<string>('consultation.voiceVideoEnabled', 'false') === 'true');
    if (!voiceVideoEnabled) {
      const textOnlyRate = Number(this.config?.get<number>('consultation.textOnlyPerMinPaise', 0) ?? 0);
      if (textOnlyRate < pricePerMinPaise) {
        this.logger.warn(
          `Voice/video disabled — capping billing for session=${sessionId} at text-only rate ${textOnlyRate}p/min (was ${pricePerMinPaise}p/min).`,
        );
        pricePerMinPaise = textOnlyRate;
      }
    }

    const now = new Date().toISOString();

    // userId was already written by hsetnx above; set remaining fields
    await this.redis.getClient().hset(key, {
      providerId,
      bookingId,
      pricePerMinPaise: String(pricePerMinPaise),
      startedAt: now,
      totalSeconds: '0',
      lastTickAt: '',
    });
    await this.redis.expire(key, BILLING_TTL);

    // P1-2: Schedule BullMQ repeatable job via ensureRepeatableJob (uses SETNX lock,
    // prevents duplicate registration on concurrent calls).
    await this.ensureRepeatableJob(sessionId);

    // P1-3: Mark session as active in Postgres so we can recover if Redis is
    // wiped (session row created by the gateway, so we only update if it exists).
    await this.sessions
      .createQueryBuilder()
      .update()
      .set({ sessionStatus: SessionStatus.ACTIVE, startedAt: new Date(now) })
      .where('id = :id', { id: sessionId })
      .execute()
      .catch(() => {/* session row may not exist yet — gateway creates it */});

    this.logger.log(
      `Billing started: session=${sessionId} user=${userId} rate=${pricePerMinPaise}p/min`,
    );

    this.notifs.send(
      userId,
      NotificationType.CONSULTATION_STARTED,
      '🕉️ Consultation Started',
      'Your consultation session has begun. You are being billed per minute.',
      { sessionId, bookingId },
    ).catch(() => {});
    this.notifs.send(
      providerId,
      NotificationType.CONSULTATION_STARTED,
      '🕉️ Consultation Started',
      'A consultation session has begun.',
      { sessionId, bookingId },
    ).catch(() => {});
  }

  async stopBilling(sessionId: string): Promise<{ totalMinutes: number; totalCharged: number }> {
    // P1-2: Remove BullMQ repeatable job first, then clean up Redis.
    await this.removeRepeatableJob(sessionId);

    const key = BILLING_KEY(sessionId);
    const state = await this.getRedisState(key);

    if (!state) {
      this.logger.warn(`stopBilling: no Redis state found for session=${sessionId}`);
      return { totalMinutes: 0, totalCharged: 0 };
    }

    const pricePerMinPaise = parseInt(state.pricePerMinPaise, 10);

    const anchorIso = state.lastTickAt && state.lastTickAt.length > 0
      ? state.lastTickAt
      : state.startedAt;
    const anchorMs = Date.parse(anchorIso);
    const partialSecs = isNaN(anchorMs)
      ? 0
      : Math.max(0, Math.floor((Date.now() - anchorMs) / 1000));

    if (partialSecs > 30) {
      await this.doDebit(sessionId, state);
    }

    const minuteCountStr = await this.redis.getClient().hget(key, 'minuteCount').catch(() => null);
    const totalMinutes = minuteCountStr ? parseInt(minuteCountStr, 10) :
      await this.ticks.count({ where: { sessionId, status: TickStatus.DEBITED } });
    const totalCharged = totalMinutes * pricePerMinPaise;

    await this.redis.del(key);

    // P1-3: Persist final billing result to Postgres.
    await this.sessions
      .createQueryBuilder()
      .update()
      .set({
        sessionStatus: SessionStatus.ENDED,
        endedAt: new Date(),
        totalCharge: totalCharged,
        billableSeconds: totalMinutes * 60,
      })
      .where('id = :id', { id: sessionId })
      .execute()
      .catch((err: Error) => {
        // Log at ERROR level — billing has stopped in Redis but the DB session record
        // was not updated. This will show as a mismatch in reconciliation and must be
        // investigated. Does NOT re-throw: stopBilling callers have already committed.
        this.logger.error(
          { err, sessionId, totalMinutes, totalCharged },
          'stopBilling: failed to update consultation_sessions row — reconciliation alert expected',
        );
      });

    this.logger.log(
      `Billing stopped: session=${sessionId} minutes=${totalMinutes} charged=${totalCharged}p (partial=${partialSecs}s)`,
    );

    const amountInr = Math.round(totalCharged / 100);
    this.notifs.send(
      state.userId,
      NotificationType.CONSULTATION_ENDED,
      '✅ Consultation Ended',
      `Your session lasted ${totalMinutes} min. Total charged: ₹${amountInr}.`,
      { sessionId, totalMinutes: String(totalMinutes), totalCharged: String(totalCharged) },
    ).catch(() => {});
    this.notifs.send(
      state.providerId,
      NotificationType.CONSULTATION_ENDED,
      '✅ Consultation Ended',
      `Session ended. Duration: ${totalMinutes} min. Earnings will be credited to your account.`,
      { sessionId, totalMinutes: String(totalMinutes) },
    ).catch(() => {});

    return { totalMinutes, totalCharged };
  }

  async resumeSession(sessionId: string): Promise<boolean> {
    const key = BILLING_KEY(sessionId);
    const exists = await this.redis.exists(key);
    if (!exists) {
      this.logger.warn(`resumeSession: no Redis state for session=${sessionId}`);
      return false;
    }
    await this.ensureRepeatableJob(sessionId);
    this.logger.log(`Session resumed: ${sessionId}`);
    return true;
  }

  async getTicks(sessionId: string): Promise<SessionBillingTick[]> {
    return this.ticks.find({ where: { sessionId }, order: { tickMinute: 'ASC' } });
  }

  isActiveLocally(sessionId: string): boolean {
    // With BullMQ we can't check "locally" cheaply — approximate via Redis key.
    return false;
  }

  async isActiveGlobally(sessionId: string): Promise<boolean> {
    return this.redis.exists(BILLING_KEY(sessionId));
  }

  /**
   * Public tick — called by BillingTickProcessor.
   * Was previously private/called from setInterval.
   */
  async tick(sessionId: string): Promise<void> {
    const key = BILLING_KEY(sessionId);
    const state = await this.getRedisState(key);
    if (!state) {
      // Redis state gone — remove the repeatable job to stop future ticks.
      await this.removeRepeatableJob(sessionId).catch(() => {});
      return;
    }
    await this.doDebit(sessionId, state);
  }

  private async doDebit(sessionId: string, state: RedisBillingState): Promise<void> {
    const key = BILLING_KEY(sessionId);
    const pricePerMinPaise = parseInt(state.pricePerMinPaise, 10);

    // Read current count first (without incrementing) to get the next minute number.
    // The Redis hincrby is committed ONLY after the DB row is successfully persisted,
    // so a DB failure never advances the counter.
    const currentCountStr = await this.redis.getClient().hget(key, 'minuteCount').catch(() => null);
    const minute = (currentCountStr ? parseInt(currentCountStr, 10) : 0) + 1;

    let tick = this.ticks.create({
      sessionId,
      tickMinute: minute,
      amountPaise: pricePerMinPaise,
      status: TickStatus.PENDING,
    });

    try {
      tick = await this.ticks.save(tick);
    } catch (_e: unknown) {
      const existing = await this.ticks.findOne({ where: { sessionId, tickMinute: minute } });
      if (!existing) {
        this.logger.warn(`Duplicate tick collision but no row found: session=${sessionId} minute=${minute}`);
        return;
      }
      if (existing.status === TickStatus.DEBITED) {
        this.logger.debug(`Duplicate tick suppressed: session=${sessionId} minute=${minute} already debited`);
        return;
      }
      this.logger.warn(
        `Taking over orphaned tick: session=${sessionId} minute=${minute} prev=${existing.status}`,
      );
      tick = existing;
    }

    // Increment counter only after DB row is confirmed persisted.
    const nowIso = new Date().toISOString();
    await this.redis.getClient().hincrby(key, 'minuteCount', 1);
    await this.redis.getClient().hset(key, {
      totalSeconds: String(minute * 60),
      lastTickAt: nowIso,
    });
    await this.redis.expire(key, BILLING_TTL);

    const idempotencyKey = `${sessionId}-min-${minute}`;

    try {
      const result = await this.walletService.debit(state.userId, {
        amount: pricePerMinPaise,
        referenceId: sessionId,
        referenceType: 'consultation_tick',
        idempotencyKey,
        description: `Consultation minute ${minute}`,
      });

      if (!result.success || result.insufficientFunds) {
        await this.ticks.update(tick.id, { status: TickStatus.FAILED });
        this.events.emit('billing.insufficient', { sessionId, userId: state.userId, minute });
        await this.removeRepeatableJob(sessionId).catch(() => {});
        await this.redis.del(key);
        return;
      }

      const balanceAfter = result.newBalance ?? 0;

      await this.ticks.update(tick.id, {
        status: TickStatus.DEBITED,
        walletTxId: result.entry?.id ?? null,
        debitedAt: new Date(),
      });

      // P1-3: Keep running total in Postgres (best-effort, non-blocking).
      this.sessions
        .createQueryBuilder()
        .update()
        .set({ totalCharge: () => `total_charge + ${pricePerMinPaise}`, billableSeconds: () => `billable_seconds + 60` })
        .where('id = :id', { id: sessionId })
        .execute()
        .catch(() => {});

      if (balanceAfter < pricePerMinPaise * 2) {
        this.events.emit('billing.low_balance', {
          sessionId, userId: state.userId,
          balanceAfter,
          minutesRemaining: Math.floor(balanceAfter / pricePerMinPaise),
        });
      }
    } catch (err: unknown) {
      await this.ticks.update(tick.id, { status: TickStatus.FAILED });
      this.logger.error(
        `Wallet debit error: session=${sessionId} minute=${minute} - ` +
          String((err as Error)?.message ?? err),
      );
    }
  }

  private async ensureRepeatableJob(sessionId: string): Promise<void> {
    const flagKey = `billing:job:registered:${sessionId}`;
    const alreadyRegistered = await this.redis.getClient().set(flagKey, '1', 'EX', 86400, 'NX');
    if (!alreadyRegistered) return; // job already registered (NX returned null = key existed)

    await this.billingQueue.add(
      BILLING_TICK_JOB,
      { sessionId },
      {
        repeat: { every: getTickIntervalMs(this.config), key: `billing-${sessionId}` },
        jobId: `billing-${sessionId}`,
        removeOnComplete: true,
      },
    );
    this.logger.log(`Billing repeatable job registered for session ${sessionId}`);
  }

  private async removeRepeatableJob(sessionId: string): Promise<void> {
    const flagKey = `billing:job:registered:${sessionId}`;
    await this.redis.getClient().del(flagKey);
    await this.billingQueue.removeRepeatableByKey(`billing-${sessionId}`).catch(() => {});
  }

  private async getRedisState(key: string): Promise<RedisBillingState | null> {
    const raw = await this.redis.getClient().hgetall(key);
    if (!raw || !raw['userId']) return null;
    return raw as unknown as RedisBillingState;
  }

  private billingKey(sessionId: string): string {
    return BILLING_KEY(sessionId);
  }

  private getPrefix(): string {
    return (this.redis.getClient().options.keyPrefix as string | undefined) ?? '';
  }

  private sessionIdFromKey(rawKey: string): string | null {
    const marker = 'session:billing:';
    const idx = rawKey.indexOf(marker);
    if (idx === -1) return null;
    const id = rawKey.slice(idx + marker.length);
    return id.length > 0 ? id : null;
  }
}
