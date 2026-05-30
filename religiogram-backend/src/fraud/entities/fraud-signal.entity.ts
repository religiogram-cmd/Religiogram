import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FraudSignalType {
  WALLET_VELOCITY      = 'wallet_velocity',
  REVIEW_MANIPULATION  = 'review_manipulation',
  FAKE_BOOKING         = 'fake_booking',
  SUSPICIOUS_DEVICE    = 'suspicious_device',
  DOC_HASH_MATCH       = 'doc_hash_match',
}

@Entity('fraud_signals')
@Index('idx_fraud_signals_user',     ['userId'])
@Index('idx_fraud_signals_type',     ['signalType'])
@Index('idx_fraud_signals_resolved', ['isResolved'])
export class FraudSignal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'signal_type', type: 'enum', enum: FraudSignalType })
  signalType!: FraudSignalType;

  @Column({ name: 'risk_score', type: 'int' })
  riskScore!: number;

  @Column({ type: 'jsonb', default: {} })
  details!: Record<string, unknown>;

  @Column({ name: 'is_resolved', default: false })
  isResolved!: boolean;

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
