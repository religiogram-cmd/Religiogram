import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum QueueStatus {
  PENDING   = 'pending',
  IN_REVIEW = 'in_review',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
}

@Entity('verification_review_queue')
export class VerificationReviewQueue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'provider_id' })
  providerId!: string;

  @Column({ name: 'queue_status', type: 'varchar', length: 20, default: QueueStatus.PENDING })
  queueStatus!: QueueStatus;

  @Column({ name: 'assigned_admin_id', nullable: true })
  assignedAdminId?: string;

  @Column({ type: 'smallint', default: 2 })
  priority!: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date;
}
