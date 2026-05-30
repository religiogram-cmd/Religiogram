import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { AlertsService } from '../common/alerts/alerts.service';

interface RazorpayOrderDetail {
  status: string;
  attempts: number;
  amount: number;
}

interface RazorpayPaymentEntity {
  id: string;
  status: string;
  amount: number;
}

@Injectable()
export class PaymentPollingService {
  private readonly logger = new Logger(PaymentPollingService.name);
  private readonly razorpayKeyId: string;
  private readonly razorpayKeySecret: string;

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
    private readonly alerts: AlertsService,
  ) {
    this.razorpayKeyId     = this.config.get<string>('razorpay.keyId', '');
    this.razorpayKeySecret = this.config.get<string>('razorpay.keySecret', '');
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'payment-order-polling' })
  async pollPendingOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const pending = await this.paymentRepo.find({
      where: { status: PaymentStatus.CREATED, createdAt: LessThan(cutoff) },
      take: 50,
    });
    if (!pending.length) return;
    this.logger.log(`Polling ${pending.length} pending payment orders`);
    for (const payment of pending) await this.checkOrder(payment);
  }

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'payment-order-expiry' })
  async expireStaleOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    let processed = 0;
    while (true) {
      const stale = await this.paymentRepo.find({
        where: { status: PaymentStatus.CREATED, createdAt: LessThan(cutoff) },
        take: 100,
        order: { createdAt: 'ASC' },
      });
      if (stale.length === 0) break;
      for (const payment of stale) {
        await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED });
      }
      processed += stale.length;
      if (stale.length < 100) break;
    }
    this.logger.log(`expireStaleOrders: expired ${processed} payments`);
  }

    private async fetchOrder(orderId: string | null | undefined): Promise<RazorpayOrderDetail | null> {
    if (!orderId) return null;
    try {
      const auth = Buffer.from(`${this.razorpayKeyId}:${this.razorpayKeySecret}`).toString('base64');
      const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`Razorpay order poll failed for ${orderId}: ${res.status}`);
        return null;
      }
      return (await res.json()) as RazorpayOrderDetail;
    } catch (err) {
      this.logger.error(`Error polling order ${orderId}: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchOrderPayments(orderId: string): Promise<RazorpayPaymentEntity[]> {
    try {
      const auth = Buffer.from(`${this.razorpayKeyId}:${this.razorpayKeySecret}`).toString('base64');
      const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { items: RazorpayPaymentEntity[] };
      return body.items ?? [];
    } catch {
      return [];
    }
  }

  private async checkOrder(payment: Payment): Promise<void> {
    if (!payment.razorpayOrderId) return;
    const order = await this.fetchOrder(payment.razorpayOrderId);
    if (!order) return;

    try {
      if (order.status === 'paid') {
        const payments = await this.fetchOrderPayments(payment.razorpayOrderId);
        const captured = payments.find(p => p.status === 'captured');
        if (!captured) {
          this.logger.warn(`Order ${payment.razorpayOrderId} status=paid but no captured payment found`);
          return;
        }
        if (captured.amount !== payment.amountPaise) {
          this.logger.error(
            `Order ${payment.razorpayOrderId} captured amount mismatch expected=${payment.amountPaise} received=${captured.amount}`,
          );
          await this.paymentRepo.update(payment.id, {
            status: PaymentStatus.FAILED,
            failureReason: `Captured amount mismatch: expected=${payment.amountPaise} received=${captured.amount}`,
          });
          return;
        }

        const upd = await this.paymentRepo
          .createQueryBuilder()
          .update(Payment)
          .set({ status: PaymentStatus.CAPTURED, razorpayPaymentId: captured.id })
          .where('id = :id AND status != :captured', { id: payment.id, captured: PaymentStatus.CAPTURED })
          .execute();

        if (upd.affected) {
          if (payment.bookingId) await this.bookingsService.confirmBooking(payment.bookingId, payment.id);
          this.logger.log(`Order ${payment.razorpayOrderId} captured via polling`);
        }
      } else if (order.status === 'expired' || order.attempts >= 3) {
        const upd = await this.paymentRepo
          .createQueryBuilder()
          .update(Payment)
          .set({ status: PaymentStatus.FAILED, failureReason: 'Order expired/failed' })
          .where('id = :id AND status = :created', { id: payment.id, created: PaymentStatus.CREATED })
          .execute();
        if (upd.affected) {
          if (payment.bookingId) await this.bookingsService.markPaymentFailed(payment.bookingId, 'Payment expired or failed');
        }
      }
    } catch (err) {
      this.logger.error(`Error processing polled order ${payment.razorpayOrderId}: ${(err as Error).message}`);
      await this.alerts.fire({
        channel: 'payment_failure',
        severity: 'warn',
        message: `Payment polling error for order ${payment.razorpayOrderId}`,
        context: { paymentId: payment.id, error: (err as Error).message },
      });
    }
  }
}
