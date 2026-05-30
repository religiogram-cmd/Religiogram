import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { User } from '../../users/entities/user.entity';

export enum PaymentStatus {
  CREATED = 'created',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

@Entity('payments')
@Index('idx_payments_booking_id', ['bookingId'])
@Index('idx_payments_razorpay_order', ['razorpayOrderId'], {
  unique: true,
  where: '"razorpay_order_id" IS NOT NULL',
})
@Index('idx_payments_razorpay_payment', ['razorpayPaymentId'], {
  unique: true,
  where: '"razorpay_payment_id" IS NOT NULL',
})
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking | null;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'varchar',
    enum: PaymentStatus,
    default: PaymentStatus.CREATED,
  })
  status!: PaymentStatus;

  @Column({
    name: 'amount_paise',
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v === null ? 0 : Number(v)),
    },
  })
  amountPaise!: number;

  /** Cumulative refunded paise. Detects partial vs full refund. */
  @Column({
    name: 'refunded_amount_paise',
    type: 'bigint',
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v === null ? 0 : Number(v)),
    },
  })
  refundedAmountPaise!: number;

  @Column({ name: 'currency', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'razorpay_order_id', nullable: true })
  razorpayOrderId!: string;

  @Column({ name: 'razorpay_payment_id', nullable: true })
  razorpayPaymentId!: string;

  @Column({ name: 'razorpay_signature', nullable: true })
  razorpaySignature!: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string;

  @Column({ name: 'refund_id', nullable: true })
  refundId!: string;

  /**
   * Client idempotency key derived from bookingId — prevents duplicate
   * Razorpay order creation on retried requests.
   */
  @Column({ name: 'idempotency_key', length: 64, unique: true })
  idempotencyKey!: string;

  /** Raw Razorpay webhook payload stored for audit and debugging. */
  @Column({ name: 'webhook_payload', type: 'jsonb', nullable: true })
  webhookPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
