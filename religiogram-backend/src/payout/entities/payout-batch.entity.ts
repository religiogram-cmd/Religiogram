import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum BatchStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('payout_batches')
@Index('idx_payout_batches_provider', ['providerId'])
export class PayoutBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  @Index()
  providerId!: string;

  @Column({ name: 'total_amount_paise', type: 'int' })
  totalAmountPaise!: number;

  @Column({ name: 'settlement_date', type: 'date' })
  settlementDate!: Date;

  @Column({ name: 'gateway_payout_id', type: 'varchar', nullable: true })
  gatewayPayoutId!: string | null;

  @Column({ type: 'varchar', enum: BatchStatus, default: BatchStatus.SCHEDULED })
  status!: BatchStatus;

  @Column({ name: 'utr_number', type: 'varchar', nullable: true })
  utrNumber!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
