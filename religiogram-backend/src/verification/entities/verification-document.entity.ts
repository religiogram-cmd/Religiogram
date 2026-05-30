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

export enum DocType {
  AADHAAR = 'aadhaar',
  PAN = 'pan',
  CERTIFICATE = 'certificate',
  PHOTO = 'photo',
  VIDEO = 'video_liveness',
  REFERENCE = 'reference_letter',
}

@Entity('verification_documents')
@Index('idx_verification_documents_submission', ['submissionId'])
export class VerificationDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'submission_id' })
  submissionId!: string;

  @ManyToOne(() => VerificationSubmission, (s: any) => s.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'submission_id' })
  submission!: VerificationSubmission;

  @Column({ type: 'varchar', enum: DocType })
  type!: DocType;

  @Column({ name: 's3_key' })
  s3Key!: string;

  @Column({ name: 's3_bucket' })
  s3Bucket!: string;

  @Column({ name: 'content_hash' })
  contentHash!: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;
}
