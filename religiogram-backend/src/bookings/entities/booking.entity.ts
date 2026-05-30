import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  VersionColumn,
  BeforeInsert,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderEntity } from '../../service-providers/entities/provider.entity';
import { randomBytes } from 'crypto';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PAYMENT_FAILED = 'payment_failed',
  IN_PROGRESS = 'in_progress',
  DISPUTED = 'disputed',
}

export enum BookingType {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum PaymentMethod {
  WALLET = 'wallet',
  UPI = 'upi',
  CARD = 'card',
}

@Entity('bookings')
@Index('idx_bookings_user_status', ['userId', 'status'])
@Index('idx_bookings_provider_scheduled', ['providerId', 'scheduledAt'])
@Index('idx_bookings_scheduled_at', ['scheduledAt'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Human-readable booking reference, e.g. RG-B-A1B2C3D4 */
  @Column({ name: 'booking_ref', length: 20, unique: true })
  bookingRef!: string;

  @BeforeInsert()
  generateBookingRef() {
    if (!this.bookingRef) {
      // P3 (v4): 8 bytes / 16 hex chars => 64-bit keyspace, no collisions in practice
      const suffix = randomBytes(8).toString('hex').toUpperCase();
      this.bookingRef = `RG-B-${suffix}`;
    }
  }

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @ManyToOne(() => ProviderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'provider_id' })
  provider!: ProviderEntity;

  @Column({ name: 'service_name', length: 200 })
  serviceName!: string;

  @Column({ name: 'service_id', nullable: true })
  serviceId!: string;

  @Column({
    type: 'varchar',
    enum: BookingType,
    default: BookingType.ONLINE,
  })
  type!: BookingType;

  @Column({
    type: 'varchar',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status!: BookingStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'duration_minutes', type: 'int', default: 60 })
  durationMinutes!: number;

  /** Store in paise (Rs.1 = 100 paise) to avoid float precision issues. */
  // D9: DB column is BIGINT (amounts up to ₹92 trillion) but entity was INT
  // (max ₹21 M, which breaks high-value bookings). Add a transformer so
  // TypeORM's postgres driver, which returns bigint columns as strings,
  // is safely coerced to a JS number without silent truncation.
  @Column({
    name: 'amount_paise',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  amountPaise!: number;

  /** Platform fee in paise */
  @Column({
    name: 'platform_fee_paise',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  platformFeePaise!: number;

  @Column({ name: 'currency', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string;

  @Column({ name: 'cancelled_by', length: 20, nullable: true })
  cancelledBy?: string;

  /** Tax amount in paise (GST) */
  @Column({ name: 'tax_amount_paise', type: 'bigint', default: 0 })
  taxAmountPaise!: number;

  /** Provider's net amount in paise (total - tax - platform_fee) */
  @Column({ name: 'provider_amount_paise', type: 'bigint', default: 0 })
  providerAmountPaise!: number;

  @Column({ name: 'payment_status', length: 20, default: 'unpaid' })
  paymentStatus!: string;

  @Column({ name: 'user_timezone', length: 50, default: 'Asia/Kolkata' })
  userTimezone!: string;

  @Column({ name: 'user_address_id', nullable: true })
  userAddressId?: string;

  /**
   * Delivery / on-site address stored as JSON.
   * Shape: { line1: string, city: string, state: string, pincode: string, lat?: number, lon?: number }
   */
  @Column({ name: 'address_json', type: 'jsonb', nullable: true })
  addressJson!: Record<string, unknown> | null;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    enum: PaymentMethod,
    default: PaymentMethod.WALLET,
  })
  paymentMethod!: PaymentMethod;

  /** Ledger entry id from wallet debit -- used for idempotent refunds */
  @Column({ name: 'wallet_debit_ref', type: 'varchar', nullable: true })
  walletDebitRef!: string | null;

  /** External payment reference (Payment row id). Set when confirmed via gateway. */
  @Column({ name: 'payment_ref', type: 'uuid', nullable: true })
  paymentRef?: string | null;


  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /**
   * Cancellation timestamp — set when status transitions to CANCELLED.
   */
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
