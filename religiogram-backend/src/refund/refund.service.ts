import {
  Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { RefundRequest, RefundState, CancellationBy } from './entities/refund-request.entity';
import { CreateRefundDto } from './dto/create-refund.dto';
import { WalletService } from '../wallet/wallet.service';
import { AlertsService } from '../common/alerts/alerts.service';
import { PaymentsService } from '../payments/payments.service';
import { FraudService } from '../fraud/fraud.service';

const FULL_REFUND_HOURS = 24;
const PARTIAL_REFUND_HOURS = 1;
const AUTO_APPROVE_MAX_PAISE = 50000;

interface RefundPolicy {
  refundPct: number;
  platformFeeRefundPct: number;
  providerCompPct: number;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(RefundRequest) private readonly refundRepo: Repository<RefundRequest>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly walletService: WalletService,
    private readonly alerts: AlertsService,
    @InjectQueue('refunds') private readonly queue: Queue,
    // M2: injected with forwardRef to avoid circular dep; used in processRefund()
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    // M4: fraud gate check before auto-approving refunds
    private readonly fraudService: FraudService,
  ) {}

  async createRefund(dto: CreateRefundDto): Promise<RefundRequest> {
    const existing = await this.refundRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    const [booking] = await this.ds.query<any[]>(
      `SELECT b.id, b.user_id, b.scheduled_at, b.amount_paise, b.status, b.wallet_debit_ref,
              p.id AS payment_id, p.status AS payment_status,
              p.amount_paise AS captured_paise,
              COALESCE(p.refunded_amount_paise, 0) AS refunded_paise
       FROM bookings b
       LEFT JOIN payments p ON p.booking_id = b.id AND p.status IN ('captured','refunded')
       WHERE b.id = $1
       LIMIT 1`,
      [dto.bookingId],
    );

    if (!booking) throw new NotFoundException(`Booking ${dto.bookingId} not found`);

    const isWalletPaid = !!booking.wallet_debit_ref;
    const capturedPaise = Number(booking.captured_paise ?? 0);
    const refundedPaise = Number(booking.refunded_paise ?? 0);
    const isGatewayPaid = booking.payment_status === 'captured' || booking.payment_status === 'refunded';

    if (!isWalletPaid && !isGatewayPaid) {
      throw new BadRequestException(
        `Cannot refund booking ${dto.bookingId}: no captured payment found`,
      );
    }

    const scheduledAt = new Date(booking.scheduled_at);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Booking scheduled_at is invalid');
    }

    const policy = this.calculatePolicy(dto.cancellationBy, scheduledAt);
    const requestedAmount = Math.floor(dto.amountPaise * policy.refundPct / 100);

    if (isGatewayPaid) {
      const remaining = capturedPaise - refundedPaise;
      if (requestedAmount > remaining) {
        throw new BadRequestException(
          `Refund amount ${requestedAmount} exceeds remaining capturable ${remaining}`,
        );
      }
    }

    // M4: Run fraud gate before auto-approving. Even small refunds can be part
    // of a velocity-abuse pattern (e.g., book→cancel→book at scale).
    // If the fraud check flags the user, fall back to REQUESTED (manual review).
    let refundState = RefundState.REQUESTED;
    if (requestedAmount <= AUTO_APPROVE_MAX_PAISE) {
      const fraud = await this.fraudService.checkWalletVelocity(
        dto.userId,
        '',   // IP not available in async refund flow — velocity check still fires on userId key
      ).catch(() => ({ blocked: false, riskScore: 0 }));
      if (!fraud.blocked && fraud.riskScore < 70) {
        refundState = RefundState.APPROVED;
      } else {
        this.logger.warn(
          `Auto-approve suppressed for user ${dto.userId}: fraud.blocked=${fraud.blocked} riskScore=${fraud.riskScore}`,
        );
      }
    }

    await this.ds.query(
      `INSERT INTO refund_requests
         (id, booking_id, user_id, amount_paise, reason, cancellation_by,
          idempotency_key, metadata, state, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now(), now())
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = refund_requests.updated_at
       RETURNING *`,
      [
        dto.bookingId, dto.userId, requestedAmount, dto.reason, dto.cancellationBy,
        dto.idempotencyKey,
        JSON.stringify({ originalAmount: dto.amountPaise, policy, isWalletPaid }),
        refundState,
      ],
    );

    const saved = await this.refundRepo.findOneOrFail({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (saved.state === RefundState.APPROVED) {
      await this.queue.add('process-refund', { refundId: saved.id }, {
        attempts: 4,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: `refund-${saved.id}`,
      });
    }
    return saved;
  }

  async approve(refundId: string, reviewerId: string, notes?: string): Promise<RefundRequest> {
    const upd = await this.refundRepo
      .createQueryBuilder()
      .update(RefundRequest)
      .set({ state: RefundState.APPROVED, reviewerId, reviewNotes: notes })
      .where('id = :id AND state IN (:...allowed)', {
        id: refundId,
        allowed: [RefundState.REQUESTED, RefundState.REVIEWING],
      })
      .execute();
    if (!upd.affected) throw new BadRequestException('Refund is not in an approvable state');

    await this.queue.add('process-refund', { refundId }, {
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
      jobId: `refund-${refundId}`,
    });
    return this.findOrFail(refundId);
  }

  async reject(refundId: string, reviewerId: string, reason: string): Promise<RefundRequest> {
    const upd = await this.refundRepo
      .createQueryBuilder()
      .update(RefundRequest)
      .set({ state: RefundState.REJECTED, reviewerId, rejectionReason: reason })
      .where('id = :id AND state IN (:...allowed)', {
        id: refundId,
        allowed: [RefundState.REQUESTED, RefundState.REVIEWING],
      })
      .execute();
    if (!upd.affected) throw new BadRequestException('Refund is not in a rejectable state');
    return this.findOrFail(refundId);
  }

  async processRefund(refundId: string): Promise<void> {
    const claim = await this.refundRepo
      .createQueryBuilder()
      .update(RefundRequest)
      .set({ state: RefundState.PROCESSING })
      .where('id = :id AND state = :approved', { id: refundId, approved: RefundState.APPROVED })
      .execute();

    if (!claim.affected) {
      this.logger.warn(`processRefund: refund ${refundId} not in APPROVED state; skipping`);
      return;
    }

    const refund = await this.findOrFail(refundId);

    try {
      // M2: Determine payment method so we call the right refund path.
      // A booking paid through Razorpay (gateway payment) requires a real API
      // call to Razorpay, not just a wallet credit — otherwise the customer's
      // bank/card is never refunded even though our ledger shows a credit.
      const [booking] = await this.ds.query<any[]>(
        `SELECT b.wallet_debit_ref,
                p.id AS payment_id, p.status AS payment_status
         FROM bookings b
         LEFT JOIN payments p ON p.booking_id = b.id AND p.status IN ('captured','refunded')
         WHERE b.id = $1 LIMIT 1`,
        [refund.bookingId],
      );

      const isGatewayPaid = booking?.payment_status === 'captured' ||
                            booking?.payment_status === 'refunded';
      const isWalletPaid  = !!booking?.wallet_debit_ref && !isGatewayPaid;

      if (isGatewayPaid) {
        // M2: Call Razorpay refund API (idempotent — safe to retry)
        this.logger.log(
          `processRefund ${refundId}: gateway-paid booking — calling Razorpay refund API`,
        );
        await this.paymentsService.refundPayment(refund.bookingId, refund.amountPaise);
      } else if (isWalletPaid) {
        // Wallet-paid booking: credit the wallet back
        await this.walletService.credit(refund.userId, {
          amount: refund.amountPaise,
          referenceId: refundId,
          referenceType: 'refund',
          description: `Refund for booking ${refund.bookingId}`,
          idempotencyKey: `refund-credit-${refundId}`,
        });
      } else {
        // No payment record found (e.g., booking was free / never captured)
        this.logger.warn(
          `processRefund ${refundId}: no payment record for booking ${refund.bookingId} — skipping money movement`,
        );
      }

      await this.refundRepo.update(refundId, {
        state: RefundState.COMPLETED,
        completedAt: new Date(),
      });
      this.logger.log(`Refund ${refundId} completed: ${refund.amountPaise} paise to user ${refund.userId}`);
    } catch (err) {
      await this.refundRepo.update(refundId, { state: RefundState.FAILED });
      this.logger.error(`Refund ${refundId} failed`, err);
      await this.alerts.fire({
        channel: 'refund_failures',
        severity: 'critical',
        message: `Refund processing failed for ${refundId}`,
        context: { refundId, userId: refund.userId, amountPaise: refund.amountPaise },
        error: err as Error,
      });
      throw err;
    }
  }

  @Cron('*/30 * * * *', { name: 'retry-failed-refunds' })
  async retryFailedRefunds(): Promise<void> {
    const failed = await this.refundRepo.find({
      where: { state: RefundState.FAILED },
      take: 50,
      order: { updatedAt: 'ASC' },
    });

    for (const refund of failed) {
      const upd = await this.refundRepo
        .createQueryBuilder()
        .update(RefundRequest)
        .set({ state: RefundState.APPROVED })
        .where('id = :id AND state = :failed', { id: refund.id, failed: RefundState.FAILED })
        .execute();
      if (!upd.affected) continue;

      await this.queue.add('process-refund', { refundId: refund.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `refund-${refund.id}`,
      });
    }

    if (failed.length > 0) this.logger.warn(`Retrying ${failed.length} failed refunds`);
  }

  private async findOrFail(id: string): Promise<RefundRequest> {
    const r = await this.refundRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Refund ${id} not found`);
    return r;
  }


  calculatePolicy(by: CancellationBy, scheduledAt: Date): RefundPolicy {
    // Provider/platform cancellations: always full refund, no provider compensation.
    if (by === CancellationBy.PROVIDER || by === CancellationBy.PLATFORM) {
      return { refundPct: 100, platformFeeRefundPct: 100, providerCompPct: 0 };
    }
    const hoursUntil = (scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil >= FULL_REFUND_HOURS) {
      // More than 24 h out — full refund, no provider compensation.
      return { refundPct: 100, platformFeeRefundPct: 100, providerCompPct: 0 };
    }
    if (hoursUntil >= PARTIAL_REFUND_HOURS) {
      // 1–24 h window — 50% back to user, provider compensated 25% for blocked slot.
      return { refundPct: 50, platformFeeRefundPct: 0, providerCompPct: 25 };
    }
    // Less than 1 h — no refund; provider compensated 50% for no-show cost.
    return { refundPct: 0, platformFeeRefundPct: 0, providerCompPct: 50 };
  }
}
