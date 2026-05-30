import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProviderServiceEntity } from './provider-service.entity';
import { AvailabilityEntity } from './availability.entity';
import { KycVideoEntity } from './kyc-video.entity';

export enum ProviderReligion {
  Hindu = 'hindu',
  Islam = 'islam',
  Sikh = 'sikh',
  Christian = 'christian',
  Other = 'other',
}

export enum ProviderStatus {
  Draft = 'draft',
  PendingReview = 'pending_review',
  Approved = 'approved',
  Rejected = 'rejected',
  Suspended = 'suspended',
}

/**
 * Provider — the hub row for a service-provider account.
 *
 * Lifecycle:
 *   draft           — user is still filling steps (paired with onboarding_drafts)
 *   pending_review  — user submitted the last step, awaiting admin approval
 *   approved        — live on the marketplace
 *   rejected        — admin rejected; user may re-submit
 *   suspended       — admin temporarily disabled the listing
 */
@Entity({ name: 'providers' })
@Index('idx_providers_status_religion', ['status', 'religion'])
@Index('idx_providers_city', ['city'])
export class ProviderEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ name: 'dob', type: 'date' })
  dob!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'city', type: 'varchar', length: 120 })
  city!: string;

  @Column({
    name: 'religion',
    type: 'varchar',
    enum: ProviderReligion,
    nullable: true,
  })
  religion!: ProviderReligion | null;

  @Column({ name: 'experience_years', type: 'smallint', nullable: true })
  experienceYears!: number | null;

  @Column({ name: 'languages', type: 'text', array: true, default: () => "'{}'" })
  languages!: string[];

  @Column({ name: 'bio', type: 'text', nullable: true })
  bio!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    enum: ProviderStatus,
    default: ProviderStatus.Draft,
  })
  status!: ProviderStatus;

  // ── Priest-flow additions (migration 040) ────────────────────────────────
  @Column({ name: 'service_mode', type: 'varchar', default: 'both' })
  serviceMode!: 'offline' | 'online' | 'both';

  @Column({ name: 'per_minute_paise', type: 'int', nullable: true })
  perMinutePaise!: number | null;

  @Column({ name: 'per_minute_tier', type: 'varchar', nullable: true })
  perMinuteTier!: 'new' | 'verified' | 'senior' | null;

  /** Full provider state machine: pending→submitted→approved|rejected→submitted(resubmit)→approved|suspended|blocked */
  @Column({ name: 'provider_state', type: 'varchar', default: 'pending' })
  providerState!: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended' | 'blocked';

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'verification_status', type: 'varchar', default: 'PENDING' })
  verificationStatus!: string;

  // Denormalised rating columns — updated by ReviewsService.updateRating()
  // after every review create/delete. Avoids a full AVG() scan per request.
  @Column({
    name: 'rating_avg',
    type: 'numeric',
    precision: 3,
    scale: 2,
    nullable: true,
    default: null,
  })
  ratingAvg!: string | null;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount!: number;

  @OneToMany(() => ProviderServiceEntity, (ps: any) => ps.provider)
  services?: ProviderServiceEntity[];

  @OneToMany(() => AvailabilityEntity, (a: any) => a.provider)
  availability?: AvailabilityEntity[];

  @OneToMany(() => KycVideoEntity, (k: any) => k.provider)
  kycVideos?: KycVideoEntity[];
}
