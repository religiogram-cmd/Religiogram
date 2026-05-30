import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Temple } from '../../temples/entities/temple.entity';
import { User } from '../../users/entities/user.entity';

export type DonationStatus = 'created' | 'captured' | 'failed' | 'refunded';

/**
 * PlaceDonation — a Razorpay-backed donation from a user to a place of worship.
 *
 * Lifecycle:
 *   created   → Razorpay order created; awaiting payment
 *   captured  → payment verified & captured
 *   failed    → Razorpay payment failed (user can retry — new order)
 *   refunded  → admin-initiated refund processed
 *
 * Idempotency: idempotency_key is generated on the server as a stable
 * slug so a retried POST /places/:id/donations/order returns the same
 * Razorpay order without double-charging.
 *
 * Privacy: is_anonymous = true suppresses the donor's name from the
 * public donors list but the row is retained for audit.
 */
@Entity('place_donations')
@Index('IDX_place_donations_place', ['placeId', 'createdAt'])
@Index('IDX_place_donations_user',  ['userId',  'createdAt'])
export class PlaceDonation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Temple;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Amount in Indian paise (₹1 = 100 paise). Min 100 (₹1). */
  @Column({ name: 'amount_paise', type: 'int' })
  amountPaise!: number;

  @Column({ length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: 'created' })
  status!: DonationStatus;

  @Column({ name: 'razorpay_order_id', type: 'varchar', length: 200, nullable: true, unique: true })
  razorpayOrderId!: string | null;

  @Column({ name: 'razorpay_payment_id', type: 'varchar', length: 200, nullable: true, unique: true })
  razorpayPaymentId!: string | null;

  @Column({ name: 'razorpay_signature', type: 'text', nullable: true })
  razorpaySignature!: string | null;

  /** Optional message from the donor to the temple. */
  @Column({ type: 'text', nullable: true })
  message!: string | null;

  /** When true the donor's name is hidden from the public donors list. */
  @Column({ name: 'is_anonymous', type: 'boolean', default: false })
  isAnonymous!: boolean;

  /** Stable idempotency key to prevent duplicate Razorpay orders. */
  @Column({ name: 'idempotency_key', length: 64, unique: true })
  idempotencyKey!: string;

  /** Raw Razorpay webhook payload stored for audit. */
  @Column({ name: 'webhook_payload', type: 'jsonb', nullable: true })
  webhookPayload!: Record<string, unknown> | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
