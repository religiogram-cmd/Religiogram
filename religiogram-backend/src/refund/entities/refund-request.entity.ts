import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum RefundState {
  REQUESTED  = 'requested',
  REVIEWING  = 'reviewing',
  APPROVED   = 'approved',
  REJECTED   = 'rejected',
  PROCESSING = 'processing',
  COMPLETED  = 'completed',
  FAILED     = 'failed',
}

export enum CancellationBy {
  USER     = 'user',
  PROVIDER = 'provider',
  PLATFORM = 'platform',
  SYSTEM   = 'system',
}

@Entity('refund_requests')
@Index('idx_refund_booking', ['bookingId'])
@Index('idx_refund_state_created', ['state', 'createdAt'])
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'amount_paise', type: 'bigint' })
  amountPaise!: number;

  @Column({ length: 3, default: 'INR' })
  currency!: string;

  @Column({ length: 100 })
  reason!: string;

  @Column({ name: 'cancellation_by', type: 'varchar', length: 20, default: CancellationBy.USER })
  cancellationBy!: CancellationBy;

  @Column({ type: 'varchar', length: 30, default: RefundState.REQUESTED })
  state!: RefundState;

  @Column({ name: 'reviewer_id', nullable: true })
  reviewerId?: string;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'idempotency_key', length: 64, unique: true })
  idempotencyKey!: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
