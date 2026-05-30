import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProviderEntity } from './provider.entity';

export enum KycStatus {
  Uploaded = 'uploaded',
  PendingReview = 'pending_review',
  Approved = 'approved',
  Rejected = 'rejected',
}

/**
 * kyc_videos — the 30-second identity video recorded in Step 7.
 *
 * Upload path:
 *   1. Client asks server for a pre-signed S3 PUT URL (see
 *      PreSignKycUploadHandler).
 *   2. Client uploads directly to S3 (no backend bytes).
 *   3. Client POSTs /provider/kyc with {s3Key, durationSeconds, ...}.
 *   4. Server validates > 30s, creates the row in 'uploaded' state.
 *   5. A background worker generates a thumbnail (ffmpeg) and flips state
 *      to 'pending_review'.
 *   6. An admin approves/rejects.
 *
 * Partial unique index at DB level:  one live (non-rejected) row per
 * provider. Re-uploading after rejection creates a new row — we keep the
 * rejected ones for audit.
 */
@Entity({ name: 'kyc_videos' })
@Index('idx_kyc_status', ['status', 'createdAt'])
export class KycVideoEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'provider_id', type: 'bigint' })
  providerId!: string;

  @ManyToOne(() => ProviderEntity, (p: any) => p.kycVideos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({ name: 's3_key', type: 'varchar', length: 512 })
  s3Key!: string;

  @Column({ name: 'thumbnail_s3_key', type: 'varchar', length: 512, nullable: true })
  thumbnailS3Key!: string | null;

  @Column({ name: 'duration_seconds', type: 'numeric', precision: 6, scale: 2 })
  durationSeconds!: string; // numeric comes back as string from pg

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 80 })
  mimeType!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    enum: KycStatus,
    default: KycStatus.Uploaded,
  })
  status!: KycStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'reviewed_by', type: 'bigint', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
