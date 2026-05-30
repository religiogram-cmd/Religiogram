import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ReferenceType {
  BOOKING = 'booking',
  SESSION = 'session',
}

export enum EarningStatus {
  PENDING = 'pending',
  IN_SETTLEMENT = 'in_settlement',
  PAID = 'paid',
  FAILED = 'failed',
}

@Entity('provider_earnings')
@Index('idx_provider_earnings_provider', ['providerId'])
@Index('idx_provider_earnings_reference', ['referenceId', 'referenceType'])
export class ProviderEarning {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  @Index()
  providerId!: string;

  @Column({ name: 'reference_id' })
  referenceId!: string;

  @Column({ name: 'reference_type', type: 'varchar', enum: ReferenceType })
  referenceType!: ReferenceType;

  @Column({ name: 'gross_amount_paise', type: 'int' })
  grossAmountPaise!: number;

  @Column({ name: 'platform_fee_paise', type: 'int' })
  platformFeePaise!: number;

  @Column({ name: 'tds_deducted_paise', type: 'int', default: 0 })
  tdsDeductedPaise!: number;

  @Column({ name: 'net_amount_paise', type: 'int' })
  netAmountPaise!: number;

  @Column({ type: 'varchar', enum: EarningStatus, default: EarningStatus.PENDING })
  status!: EarningStatus;

  @Column({ name: 'earned_at', type: 'timestamptz' })
  earnedAt!: Date;

  @Column({ name: 'payout_batch_id', type: 'uuid', nullable: true })
  @Index()
  payoutBatchId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
