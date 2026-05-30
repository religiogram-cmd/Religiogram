import {
  Injectable, Logger, NotFoundException, BadRequestException,
  UnauthorizedException, InternalServerErrorException,
} from '@nestjs/common';

// Razorpay webhook payload shape — typed to eliminate 'as any' on webhook parsing
interface RzpEntity { [key: string]: unknown; }
interface RzpWebhookPayload {
  payload?: {
    payment?: { entity?: RzpEntity };
    refund?:  { entity?: RzpEntity };
  };
}
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { createHash, createHmac, timingSafeEqual, randomBytes } from 'crypto';

import { Payment, PaymentStatus } from './entities/payment.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RedisService } from '../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhook';
export const WEBHOOK_JOB_PROCESS = 'process-webhook';

interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string;
}

interface RazorpayRefund {
  id: string;
  entity: string;
  amount: number;
  payment_id: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpayBaseUrl = 'https://api.razorpay.com/v1';

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectQueue(PAYMENT_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    private readonly circuit: CircuitBreakerService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * P1-8: Razorpay call wrapper — 15-second timeout + circuit breaker.
   *
   * Every outbound Razorpay HTTP call goes through this wrapper so that:
   *   - A Razorpay outage trips the circuit open, preventing cascading timeouts
   *   - A single slow call never holds a server thread for more than 15 seconds
   *
   * The circuit name 'razorpay' maps to a pre-configured preset in
   * CircuitBreakerService (5 failures in 60s opens the circuit for 30s).
   */
  private razorpayCall<T>(fn: () => Promise<T>, context: string): Promise<T> {
    return this.circuit.for('razorpay').execute(() => {
      let tid: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        tid = setTimeout(
          () => reject(new Error(`Razorpay ${context} timed out after 15s`)),
          15_000,
        );
      });
      return Promise.race([fn(), timeoutPromise]).finally(() => clearTimeout(tid));
    });
  }

  private get razorpayAuth() {
    const keyId = this.config.getOrThrow<string>('razorpay.keyId');
    const keySecret = this.config.getOrThrow<string>('razorpay.keySecret');
    return { username: keyId, password: keySecret };
  }
  private get keySecret(): string { return this.config.getOrThrow<string>('razorpay.keySecret'); }
  private get keyId(): string { return this.config.getOrThrow<string>('razorpay.keyId'); }
  private get webhookSecret(): string { return this.config.getOrThrow<string>('razorpay.webhookSecret'); }

  private hmacSha256(data: string, secret: string): string {
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  private safeEqualHex(expected: string, provided: string | undefined | null): boolean {
    if (!provided || typeof provided !== 'string' || expected.length !== provided.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }

  async findByPaymentId(razorpayPaymentId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { razorpayPaymentId } });
  }

  async createOrder(
    dto: CreateOrderDto,
    userId: string,
  ): Promise<{ razorpayOrderId: string; amountPaise: number; currency: string; keyId: string }> {
    const booking = await this.bookingRepo.findOne({ where: { id: dto.bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new BadRequestException('Booking does not belong to you');
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(`Booking is already ${booking.status} - cannot create a new order`);
    }
    if (!booking.currency || booking.currency.length !== 3) {
      throw new BadRequestException('Booking has invalid currency');
    }

    const idempotencyKey = dto.bookingId;

    const existing = await this.paymentRepo.findOne({ where: { idempotencyKey } });
    if (existing?.razorpayOrderId && existing.status === PaymentStatus.CREATED) {
      return {
        razorpayOrderId: existing.razorpayOrderId,
        amountPaise: existing.amountPaise,
        currency: existing.currency,
        keyId: this.keyId,
      };
    }

    let rzpOrder: RazorpayOrder;
    try {
      // P1-8: wrapped with 15s timeout + circuit breaker
      const resp = await this.razorpayCall(
        () => axios.post<RazorpayOrder>(
          `${this.razorpayBaseUrl}/orders`,
          { amount: booking.amountPaise, currency: booking.currency, receipt: booking.id },
          {
            auth: this.razorpayAuth,
            headers: { 'X-Idempotency-Key': `${idempotencyKey}-${randomBytes(8).toString('hex')}` },
          },
        ),
        'createOrder',
      );
      rzpOrder = resp.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(`Razorpay createOrder failed: ${axiosErr.message}`, (axiosErr as AxiosError).response?.data);
      throw new InternalServerErrorException('Failed to create payment order. Please try again.');
    }

    const payment = this.paymentRepo.create({
      bookingId: booking.id,
      userId,
      amountPaise: booking.amountPaise,
      currency: booking.currency,
      idempotencyKey,
    });

    payment.razorpayOrderId = rzpOrder.id;
    payment.status = PaymentStatus.CREATED;
    payment.failureReason = '';
    await this.paymentRepo.save(payment);

    return {
      razorpayOrderId: rzpOrder.id,
      amountPaise: booking.amountPaise,
      currency: booking.currency,
      keyId: this.keyId,
    };
  }

  /**
   * Create a Razorpay order for a wallet top-up (not tied to a booking).
   * The payment record is saved without a bookingId so the webhook handler and
   * POST /wallet/recharge can identify it as a wallet-credit payment.
   *
   * @param userId    authenticated user
   * @param amountPaise  amount in paise (10 min / 50,000 max enforced by controller DTO)
   */
  async createTopUpOrder(
    userId: string,
    amountPaise: number,
  ): Promise<{ razorpayOrderId: string; amountPaise: number; currency: string; keyId: string }> {
    const currency = 'INR';
    // P2-4: use a cryptographically random nonce — no two requests share the same
    // idempotency key, eliminating the 1-minute collision window.
    const nonce = randomBytes(12).toString('hex');
    const idempotencyKey = `topup-${userId}-${amountPaise}-${nonce}`;

    let rzpOrder: RazorpayOrder;
    try {
      // P1-8: wrapped with 15s timeout + circuit breaker
      const resp = await this.razorpayCall(
        () => axios.post<RazorpayOrder>(
          `${this.razorpayBaseUrl}/orders`,
          { amount: amountPaise, currency, receipt: `topup-${userId.slice(0, 8)}-${Date.now()}` },
          { auth: this.razorpayAuth },
        ),
        'createTopUpOrder',
      );
      rzpOrder = resp.data;
    } catch (err) {
      const axiosErr = err as import('axios').AxiosError;
      this.logger.error(`Razorpay createTopUpOrder failed: ${axiosErr.message}`, (axiosErr as AxiosError).response?.data);
      throw new InternalServerErrorException('Failed to create top-up order. Please try again.');
    }

    const payment = this.paymentRepo.create({
      userId,
      bookingId: null, // top-up has no booking
      amountPaise,
      currency,
      idempotencyKey,
    });
    payment.razorpayOrderId = rzpOrder.id;
    payment.status = PaymentStatus.CREATED;
    await this.paymentRepo.save(payment);

    return { razorpayOrderId: rzpOrder.id, amountPaise, currency, keyId: this.keyId };
  }

  async verifyPayment(dto: VerifyPaymentDto, userId: string): Promise<void> {
    const expectedSig = this.hmacSha256(
      `${dto.razorpayOrderId}|${dto.razorpayPaymentId}`,
      this.keySecret,
    );

    if (!this.safeEqualHex(expectedSig, dto.razorpaySignature)) {
      throw new UnauthorizedException('Invalid payment signature');
    }

    const payment = await this.paymentRepo.findOne({ where: { razorpayOrderId: dto.razorpayOrderId } });
    if (!payment) throw new NotFoundException('Payment record not found');
    if (payment.userId !== userId) throw new BadRequestException('Payment does not belong to you');
    if (payment.bookingId !== dto.bookingId) throw new BadRequestException('Booking does not match payment');

    if (payment.status === PaymentStatus.CAPTURED) {
      // P1-3 (v5): every verify call gets a log line so duplicated/replayed
      // verify calls are visible in our audit trail.
      this.logger.log(`verifyPayment idempotent replay for payment ${payment.id} (booking ${payment.bookingId}, user ${userId})`);
      return;
    }

    const updated = await this.paymentRepo
      .createQueryBuilder()
      .update(Payment)
      .set({
        status: PaymentStatus.CAPTURED,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
      })
      .where('id = :id AND status != :captured', { id: payment.id, captured: PaymentStatus.CAPTURED })
      .execute();

    if (!updated.affected) {
      this.logger.warn(`verifyPayment lost race for payment ${payment.id}; already captured (user ${userId})`);
      return;
    }
    this.logger.log(`verifyPayment success for payment ${payment.id} (booking ${payment.bookingId}, user ${userId})`);

    await this.bookingsService.confirmBooking(payment.bookingId, payment.id);
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const expectedSig = this.hmacSha256(rawBody.toString('utf8'), this.webhookSecret);
    if (!this.safeEqualHex(expectedSig, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const event = payload['event'] as string;
    // P0-6 (v4): deterministic event-id fallback from sha256(rawBody).
    const { createHash } = await import('crypto');
    const eventId =
      (payload['id'] as string | undefined) ??
      (payload['x_razorpay_event_id'] as string | undefined) ??
      `${event}-${createHash('sha256').update(rawBody).digest('hex')}`;

    this.logger.log(`Webhook received: ${event} (id=${eventId})`);

    // v9 (was v8 P2 deferred): forensic-correct body SHA from raw bytes.
    // JSON.stringify(payload) re-orders keys, producing a different digest
    // for the same payload after a round-trip — defeating audit reproducibility.
    const bodySha256 = createHash('sha256').update(rawBody).digest('hex');

    await this.webhookQueue.add(
      WEBHOOK_JOB_PROCESS,
      { event, payload, eventId, bodySha256 },
      {
        jobId: `webhook:${eventId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    );
  }

  async processWebhookEvent(
    event: string,
    payload: Record<string, unknown>,
    eventId?: string,
    bodySha256?: string,
  ): Promise<void> {
    if (eventId) {
      // v11 (GAP-3 fix): claim-then-process pattern.
      //
      // The previous INSERT ON CONFLICT DO NOTHING marked the row as
      // "received" BEFORE running the handler. If the handler threw AFTER
      // that INSERT succeeded, the BullMQ retry saw the existing row,
      // returned early, and the webhook side effect was permanently lost.
      //
      // New flow:
      //   1. INSERT ... ON CONFLICT DO UPDATE ... WHERE processed_at IS NULL
      //      returning the row's processed_at. Atomic. If the row already
      //      exists AND processed_at IS NULL, the UPDATE-WHERE succeeds and
      //      we get to process it (the retry path). If processed_at IS NOT
      //      NULL, the WHERE rejects, the RETURNING is empty, we skip.
      //   2. Run the handler. If it throws, the row stays un-processed and
      //      the next retry can claim it.
      //   3. UPDATE processed_at = now() AFTER the handler succeeds.
      const { createHash } = await import('crypto');
      const bodySha = bodySha256 ?? createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      const claim = await this.ds.query<Array<{ event_id: string; processed_at: Date | null }>>(
        `INSERT INTO webhook_events (event_id, provider, event_type, body_sha256, received_at)
         VALUES ($1, 'razorpay', $2, $3, now())
         ON CONFLICT (event_id) DO UPDATE
           SET event_type = webhook_events.event_type
           WHERE webhook_events.processed_at IS NULL
         RETURNING event_id, processed_at`,
        [eventId, event, bodySha],
      ).catch((err) => {
        this.logger.error({ err, eventId }, 'Webhook claim DB error — will retry');
        throw err; // Let BullMQ retry on DB recovery
      });

      if (claim.length === 0) {
        // Row exists with processed_at NOT NULL — already done.
        this.logger.warn(`Skipping already-processed webhook event ${eventId}`);
        return;
      }
      if (claim[0].processed_at) {
        // Belt-and-suspenders: a re-insert returned an already-processed row.
        this.logger.warn(`Skipping already-processed webhook event ${eventId} (re-claim)`);
        return;
      }

      // Redis fast-path remains as a concurrency guard between two workers
      // claiming the same un-processed row at the same millisecond.
      const lockKey = `webhook:processing:${eventId}`;
      const WEBHOOK_LOCK_TTL_SEC = 5 * 60;   // 5 min — bound at handler max duration
      const ok = await this.redis.setIfNotExists(lockKey, '1', WEBHOOK_LOCK_TTL_SEC);
      if (!ok) {
        this.logger.warn(`Skipping webhook event ${eventId} — another worker is processing it`);
        return;
      }
    }

    try {
      switch (event) {
        case 'payment.captured':
          await this.onPaymentCaptured(payload);
          break;
        case 'payment.failed':
          await this.onPaymentFailed(payload);
          break;
        case 'refund.processed':
          await this.onRefundProcessed(payload);
          break;
        default:
          this.logger.debug(`Unhandled webhook event: ${event}`);
      }

      // v11 (GAP-3 fix): mark processed_at ONLY after the switch handler returns
      // successfully. If any handler above threw, this UPDATE never runs and
      // the next BullMQ retry will claim the row again and re-run the handler.
      if (eventId) {
        await this.ds.query(
          `UPDATE webhook_events SET processed_at = now() WHERE event_id = $1 AND processed_at IS NULL`,
          [eventId],
        ).catch((err) => {
          // Failing to flip the marker is recoverable — the row will be re-claimed
          // by a later retry and the idempotent handler will no-op. Log loudly.
          this.logger.error(
            `Failed to mark webhook_events.processed_at for ${eventId}: ${(err as Error).message}`,
          );
        });
      }
    } finally {
      // Always release lock immediately on completion — don't wait for TTL
      if (eventId) {
        const lockKey = `webhook:processing:${eventId}`;
        await this.redis.del(lockKey).catch(() => {});
      }
    }
  }

  private async onPaymentCaptured(payload: Record<string, unknown>): Promise<void> {
    const entity = (payload as RzpWebhookPayload).payload?.payment?.entity as Record<string, unknown> | undefined;
    if (!entity) return;

    const rzpOrderId   = entity['order_id'] as string;
    const rzpPaymentId = entity['id'] as string;
    const amountPaise  = Number(entity['amount']);

    const payment = await this.paymentRepo.findOne({ where: { razorpayOrderId: rzpOrderId } });
    if (!payment) {
      this.logger.error(`payment.captured: no payment for order ${rzpOrderId}`);
      return;
    }
    if (payment.status === PaymentStatus.CAPTURED) return;

    if (amountPaise !== payment.amountPaise) {
      this.logger.error(
        `payment.captured: amount mismatch for ${payment.id} expected=${payment.amountPaise} received=${amountPaise}`,
      );
      await this.paymentRepo.update(
        { id: payment.id },
        {
          status: PaymentStatus.FAILED,
          failureReason: `Captured amount mismatch: expected=${payment.amountPaise} received=${amountPaise}`,
          webhookPayload: payload as unknown as Record<string, never>,
        },
      );
      return;
    }

    const updated = await this.paymentRepo
      .createQueryBuilder()
      .update(Payment)
      .set({
        status: PaymentStatus.CAPTURED,
        razorpayPaymentId: rzpPaymentId,
        webhookPayload: payload as unknown as Record<string, never>,
      })
      .where('id = :id AND status != :captured', { id: payment.id, captured: PaymentStatus.CAPTURED })
      .execute();

    if (!updated.affected) {
      this.logger.log(`payment.captured: ${payment.id} already captured by /verify; skipping`);
      return;
    }

    if (payment.bookingId) {
      await this.bookingsService.confirmBooking(payment.bookingId, payment.id);
      this.logger.log(`payment.captured: booking ${payment.bookingId} confirmed`);
    } else if (payment.userId) {
      // null bookingId means this is a wallet top-up order
      await this.walletService.credit(payment.userId, {
        amount: payment.amountPaise,
        description: 'Wallet top-up via Razorpay',
        referenceId: payment.id,
        referenceType: 'topup',
        idempotencyKey: `webhook-topup:${payment.id}`,
      });
      this.logger.log(`payment.captured: wallet top-up credited for user ${payment.userId} (payment ${payment.id})`);
    } else {
      this.logger.warn(`payment.captured: payment ${payment.id} has no bookingId and no userId — skipping`);
    }
  }

  private async onPaymentFailed(payload: Record<string, unknown>): Promise<void> {
    const entity = (payload as RzpWebhookPayload).payload?.payment?.entity as Record<string, unknown> | undefined;
    if (!entity) return;
    const rzpOrderId = entity['order_id'] as string;
    const reason = (entity['error_description'] as string) ?? 'Unknown failure';

    const payment = await this.paymentRepo.findOne({ where: { razorpayOrderId: rzpOrderId } });
    if (!payment) return;
    if (payment.status === PaymentStatus.CAPTURED || payment.status === PaymentStatus.REFUNDED) return;

    await this.paymentRepo.update(
      { id: payment.id },
      { status: PaymentStatus.FAILED, failureReason: reason, webhookPayload: payload as unknown as Record<string, never> },
    );
    this.logger.warn(`payment.failed for booking ${payment.bookingId}: ${reason}`);
  }

  private async onRefundProcessed(payload: Record<string, unknown>): Promise<void> {
    const entity = (payload as RzpWebhookPayload).payload?.refund?.entity as Record<string, unknown> | undefined;
    if (!entity) return;

    const rzpPaymentId  = entity['payment_id'] as string;
    const refundId      = entity['id'] as string;
    const refundedPaise = Number(entity['amount']);

    const payment = await this.paymentRepo.findOne({ where: { razorpayPaymentId: rzpPaymentId } });
    if (!payment) return;

    // Atomic increment — prevents TOCTOU double-credit from concurrent webhooks.
    // UPDATE returns the new running total so we can decide status in one round-trip.
    const [updated] = await this.ds.query<{ refunded_amount_paise: string; amount_paise: string; booking_id: string }[]>(
      `UPDATE payments
          SET refunded_amount_paise = refunded_amount_paise + $1,
              refund_id             = $2,
              status                = CASE
                WHEN refunded_amount_paise + $1 >= amount_paise
                THEN $3::payment_status_enum
                ELSE status
              END
        WHERE id = $4
        RETURNING refunded_amount_paise, amount_paise, booking_id`,
      [refundedPaise, refundId, PaymentStatus.REFUNDED, payment.id],
    );
    if (!updated) return; // row gone — nothing to do

    const isFull = Number(updated.refunded_amount_paise) >= Number(updated.amount_paise);
    if (isFull) {
      if (updated.booking_id) await this.bookingsService.markRefunded(updated.booking_id);
      this.logger.log({ bookingId: updated.booking_id, refundId }, 'refund.processed: fully refunded');
    } else {
      this.logger.log(
        { bookingId: updated.booking_id, refundedPaise: updated.refunded_amount_paise, totalPaise: updated.amount_paise },
        'refund.processed: partial refund',
      );
    }
  }

  /**
   * P1-1 (v5): 2-phase refund.
   *
   *   Phase 1: in a transaction, lock the payment row, compute the refundable
   *            amount, and INSERT a row into refund_attempts with
   *            status='razorpay_initiated'. The deterministic idempotency_key
   *            ensures a retry of this whole method never double-files.
   *   Phase 2: call Razorpay (outside the DB transaction so we don't hold a
   *            row lock during a remote HTTP call).
   *   Phase 3: in a transaction, update Payment + refund_attempts row.
   *            On Razorpay error: mark the attempt 'failed' so the startup
   *            reconciler can decide whether to retry or escalate.
   *
   * The migration 041-V4-Hardening creates the refund_attempts table with a
   * UNIQUE constraint on idempotency_key, so a duplicate Phase-1 INSERT is
   * a no-op and the function reuses the existing attempt row.
   */
  async refundPayment(bookingId: string, partialAmountPaise?: number): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    // ── Phase 1 ──
    const refundInfo = await this.ds.transaction(async (em) => {
      const payment = await em
        .getRepository(Payment)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.booking_id = :bookingId AND p.status = :captured', {
          bookingId, captured: PaymentStatus.CAPTURED,
        })
        .getOne();

      if (!payment) throw new BadRequestException('No captured payment available to refund for this booking');
      if (!payment.razorpayPaymentId) throw new BadRequestException('Razorpay payment ID is missing');

      const prevRefunded = Number(payment.refundedAmountPaise ?? 0);
      const remaining = payment.amountPaise - prevRefunded;
      const amount = partialAmountPaise ?? remaining;

      if (amount <= 0 || amount > remaining) {
        throw new BadRequestException(`Refund amount ${amount} is out of range (remaining=${remaining})`);
      }

      const idempotencyKey = `refund-${payment.id}-${amount}`;

      // Try to insert the attempt row. ON CONFLICT DO NOTHING lets a retry of
      // this whole method find the existing row and reuse its id.
      await em.query(
        `INSERT INTO refund_attempts
           (id, payment_id, booking_id, amount_paise, idempotency_key, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'razorpay_initiated', now())
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [payment.id, bookingId, amount, idempotencyKey],
      );
      const attemptRows = await em.query<Array<{ id: string; status: string; razorpay_refund_id: string | null }>>(
        `SELECT id, status, razorpay_refund_id FROM refund_attempts WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      const attempt = attemptRows[0];
      return {
        paymentId: payment.id,
        rzpPaymentId: payment.razorpayPaymentId,
        amount,
        idempotencyKey,
        attemptId: attempt.id,
        alreadyComplete: attempt.status === 'completed' && !!attempt.razorpay_refund_id,
        existingRazorpayRefundId: attempt.razorpay_refund_id,
      };
    });

    // If a prior attempt already completed (e.g., second call after a successful
    // first run), don't double-charge Razorpay — just ensure the booking is marked.
    if (refundInfo.alreadyComplete) {
      this.logger.log(`Refund idempotent replay for booking ${bookingId} (existing rzpRefundId=${refundInfo.existingRazorpayRefundId})`);
      await this.bookingsService.markRefunded(bookingId);
      return;
    }

    // ── Phase 2 ──
    let refund: RazorpayRefund;
    try {
      // P1-8: wrapped with 15s timeout + circuit breaker
      const resp = await this.razorpayCall(
        () => axios.post<RazorpayRefund>(
          `${this.razorpayBaseUrl}/payments/${refundInfo.rzpPaymentId}/refund`,
          {
            amount: refundInfo.amount,
            notes: {
              idempotency_key: refundInfo.idempotencyKey,
              attempt_id: refundInfo.attemptId,
            },
          },
          {
            auth: this.razorpayAuth,
            headers: { 'X-Idempotency-Key': refundInfo.idempotencyKey },
          },
        ),
        'refund',
      );
      refund = resp.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(`Razorpay refund failed: ${axiosErr.message}`, (axiosErr as AxiosError).response?.data);
      // Mark the attempt failed so the startup reconciler can decide policy.
      await this.ds.query(
        `UPDATE refund_attempts
            SET status = 'failed', error_message = $2
          WHERE id = $1`,
        [refundInfo.attemptId, String((axiosErr as AxiosError)?.message ?? 'unknown')],
      ).catch(() => {/* best-effort */});
      throw new InternalServerErrorException('Failed to process refund. Please try again.');
    }

    // ── Phase 3 ──
    // BUG-19 (v8): wrap in try/catch so a Phase-3 DB failure (after Razorpay
    // already succeeded in Phase 2) is observable. Mark the attempt
    // 'completed_db_failed' so reconcileStuckRefunds picks it up on the next
    // cron run AND so on-call gets an alert from the structured error log.
    try {
      // v10 (P1-A fix): use the shared finaliser so reconcileStuckRefunds()
      // performs the IDENTICAL state transition when it recovers a stuck row.
      await this.finalizeRefundLocally(
        refundInfo.paymentId,
        refundInfo.amount,
        refund.id,
        bookingId,
        refundInfo.attemptId,
      );
    } catch (phase3Err) {
      // Razorpay refunded the user. Our DB didn't record it. Best-effort
      // mark the attempt so the reconciler treats it as a recovery target.
      this.logger.error(
        `Refund Phase 3 FAILED for booking ${bookingId} (rzpRefundId=${refund.id}, attempt=${refundInfo.attemptId}): ${(phase3Err as Error).message}. RECONCILER WILL RECOVER.`,
        { tag: 'refund_phase3_db_failure', bookingId, attemptId: refundInfo.attemptId, rzpRefundId: refund.id },
      );
      await this.ds.query(
        `UPDATE refund_attempts
            SET status = 'completed_db_failed',
                razorpay_refund_id = $2,
                error_message = $3
          WHERE id = $1`,
        [refundInfo.attemptId, refund.id, String((phase3Err as Error).message)],
      ).catch(() => {/* best-effort; the reconciler still polls */});
      // Don't throw — Razorpay already refunded. Caller would otherwise think
      // refund failed and retry, double-refunding. We surface via the log.
      return;
    }

    await this.bookingsService.markRefunded(bookingId);
    this.logger.log(`Refund ${refund.id} issued for booking ${bookingId} (attempt=${refundInfo.attemptId})`);
  }


  /**
   * v10 (P1-A fix): shared refund finaliser. Called by:
   *   - refundPayment Phase 3 (happy path)
   *   - reconcileStuckRefunds (recovery path after Phase 3 DB failure)
   *
   * Atomically: updates payment.status + refundedAmountPaise + refundId,
   * marks the refund_attempts row 'completed', then flips the booking to
   * REFUNDED via the idempotent markRefunded() (its WHERE excludes REFUNDED
   * so a duplicate call is a no-op).
   */
  private async finalizeRefundLocally(
    paymentId: string,
    amount: number,
    razorpayRefundId: string,
    bookingId: string,
    attemptId: string,
  ): Promise<void> {
    await this.ds.transaction(async (em) => {
      const p = await em.getRepository(Payment).findOneOrFail({ where: { id: paymentId } });
      const newRefunded = Number(p.refundedAmountPaise ?? 0) + amount;
      const isFull = newRefunded >= p.amountPaise;
      await em.getRepository(Payment).update(
        { id: p.id },
        {
          status: isFull ? PaymentStatus.REFUNDED : p.status,
          refundId: razorpayRefundId,
          refundedAmountPaise: newRefunded,
        },
      );
      await em.query(
        `UPDATE refund_attempts
            SET status = 'completed', razorpay_refund_id = $2, completed_at = now()
          WHERE id = $1`,
        [attemptId, razorpayRefundId],
      );
    });
    await this.bookingsService.markRefunded(bookingId);
  }

  /**
   * P1-1 (v5): startup reconciler for stuck refund attempts.
   *
   * Any refund_attempts row that sits in razorpay_initiated for >5 minutes is
   * either: (a) Razorpay accepted it but our process died before Phase 3, or
   * (b) Razorpay never received it. We query Razorpay's GET /payments/:id/refunds
   * to decide. Called from a @Cron hourly.
   */
  async reconcileStuckRefunds(): Promise<{ checked: number; recovered: number }> {
    const stuck = await this.ds.query<Array<{ id: string; payment_id: string; booking_id: string; amount_paise: string; idempotency_key: string }>>(
      `SELECT id, payment_id, booking_id, amount_paise, idempotency_key
         FROM refund_attempts
        WHERE status IN ('razorpay_initiated', 'completed_db_failed')
          AND created_at < now() - interval '5 minutes'
        ORDER BY created_at
        LIMIT 100`,
    );
    if (stuck.length === 0) return { checked: 0, recovered: 0 };

    let recovered = 0;
    for (const row of stuck) {
      const payment = await this.paymentRepo.findOne({ where: { id: row.payment_id } });
      if (!payment?.razorpayPaymentId) continue;
      try {
        // v9 (P1 follow-up to v8 BUG-19): match by (amount + notes.idempotency_key)
        // instead of amount alone. Multiple partial refunds of equal amount on
        // the same payment would otherwise produce a phantom match.
        const resp = await this.razorpayCall(
          () => axios.get<{ items: Array<{ id: string; amount: number; status: string; notes?: Record<string, string> }> }>(
            `${this.razorpayBaseUrl}/payments/${payment.razorpayPaymentId}/refunds`,
            { auth: this.razorpayAuth },
          ),
          `GET /payments/${payment.razorpayPaymentId}/refunds`,
        );
        const match = (resp.data.items ?? []).find(
          (r) =>
            r.amount === Number(row.amount_paise) &&
            (r.notes?.idempotency_key === row.idempotency_key || r.notes?.attempt_id === row.id),
        );
        if (match) {
          await this.finalizeRefundLocally(
            row.payment_id,
            Number(row.amount_paise),
            match.id,
            row.booking_id,
            row.id,
          );
          recovered++;
        }
      } catch (err: any) {
        this.logger.warn(`Reconcile error for attempt ${row.id}: ${(err as Error).message}`);
      }
    }

    return { checked: stuck.length, recovered };
  }
}
