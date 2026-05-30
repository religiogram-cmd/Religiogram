import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { VerificationSubmission } from './verification-submission.entity';

@Entity('admin_review_notes')
@Index('idx_admin_review_notes_submission', ['submissionId'])
export class AdminReviewNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'submission_id' })
  submissionId!: string;

  @ManyToOne(() => VerificationSubmission, (s: any) => s.notes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'submission_id' })
  submission!: VerificationSubmission;

  @Column({ name: 'admin_id' })
  adminId!: string;

  @Column({ type: 'text' })
  note!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
