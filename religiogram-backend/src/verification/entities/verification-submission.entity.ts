import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { VerificationDocument } from './verification-document.entity';
import { AdminReviewNote } from './admin-review-note.entity';

export enum VerificationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MORE_INFO = 'more_info_needed',
}

@Entity('verification_submissions')
@Index('idx_verification_submissions_provider', ['providerId'])
export class VerificationSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  @Index()
  providerId!: string;

  @Column({
    type: 'varchar',
    enum: VerificationStatus,
    default: VerificationStatus.DRAFT,
  })
  status!: VerificationStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @OneToMany(() => VerificationDocument, (doc: any) => doc.submission, {
    cascade: true,
  })
  documents!: VerificationDocument[];

  @OneToMany(() => AdminReviewNote, (note: any) => note.submission, {
    cascade: true,
  })
  notes!: AdminReviewNote[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
