import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DisputeReferenceType {
  BOOKING = 'booking',
  SESSION = 'session',
}

export enum DisputeStatus {
  RAISED                 = 'raised',
  UNDER_INVESTIGATION    = 'under_investigation',
  RESOLVED_FOR_USER      = 'resolved_for_user',
  RESOLVED_FOR_PROVIDER  = 'resolved_for_provider',
  ESCALATED              = 'escalated',
  CLOSED                 = 'closed',
}

@Entity('disputes')
@Index('idx_disputes_raised_by',   ['raisedById'])
@Index('idx_disputes_status',      ['status'])
@Index('idx_disputes_sla_deadline',['slaDeadline'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dispute_ref', unique: true })
  disputeRef!: string;

  @Column({ name: 'raised_by_id' })
  raisedById!: string;

  @Column({ name: 'reference_id' })
  referenceId!: string;

  @Column({ name: 'reference_type', type: 'varchar', length: 20 })
  referenceType!: DisputeReferenceType;

  @Column({ type: 'varchar', length: 30, default: DisputeStatus.RAISED })
  status!: DisputeStatus;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', default: [] })
  evidence!: Array<{ type: string; url: string; description: string }>;

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote!: string | null;

  @Column({ name: 'refund_amount_paise', type: 'int', default: 0 })
  refundAmountPaise!: number;

  @Column({ name: 'sla_deadline', type: 'timestamptz' })
  slaDeadline!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
