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
 * A provider is either a religious officiant ("priest" — pandit, imam,
 * granthi, priest, etc.) or an astrologer. This discriminator drives the
 * onboarding wizard step content, the pricing tier ranges, and the
 * marketplace listing (Priests tab vs Astrology tab).
 *
 * Legacy rows created before this column existed default to `priest`.
 */
export enum ProviderCategory {
  Priest = 'priest',
  Astrologer = 'astrologer',
  /**
   * `both` means the provider serves as a priest AND an astrologer under a
   * single profile. Marketplace listings surface the row on BOTH the Priests
   * tab and the Astrology tab. Downstream onboarding steps show the union of
   * priest + astrologer fields (services + specialisations, in-person +
   * per-minute pricing, both channel sets).
   */
  Both = 'both',
}

/**
 * Real-time consultation channels an astrologer offers. Priest providers
 * ignore this field. Values persisted in a text[] column so we can filter
 * "video available now" on the marketplace with a GIN index.
 */
export enum ConsultationChannel {
  Chat = 'chat',
  Voice = 'voice',
  Video = 'video',
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

  // ── Category discriminator (migration 048) ───────────────────────────────
  // Drives which wizard steps + marketplace tab a provider belongs to.
  @Column({
    name: 'provider_category',
    type: 'varchar',
    enum: ProviderCategory,
    default: ProviderCategory.Priest,
  })
  @Index('idx_providers_category')
  providerCategory!: ProviderCategory;

  /**
   * Free-form list of astrology specialisations — e.g. "Vedic Astrology",
   * "KP Astrology", "Nadi", "Tarot Reading", "Numerology", "Palmistry",
   * "Vastu Shastra". Empty for priest providers.
   * Stored as text[] so we can `WHERE 'Vedic Astrology' = ANY(specialisations)`
   * with a GIN index for fast filter queries on the marketplace.
   */
  @Column({ name: 'specialisations', type: 'text', array: true, default: () => "'{}'" })
  specialisations!: string[];

  /**
   * Which real-time channels this astrologer offers: chat, voice, and/or
   * video. Priest providers leave this empty and use `serviceMode` +
   * physical bookings instead.
   */
  @Column({ name: 'consultation_channels', type: 'text', array: true, default: () => "'{}'" })
  consultationChannels!: ConsultationChannel[];

  /**
   * Per-specialisation years of experience (migration 069).
   *
   * A JSONB map from specialisation label → integer years. Example:
   *   { "Vedic Astrology": 20, "Tarot Reading": 5 }
   *
   * Providers list a specialisation once in `specialisations` and their
   * years-of-experience in this column keyed by the same string. A missing
   * key means "not specified" — the marketplace UI just shows the name
   * without a years badge.
   */
  @Column({ name: 'specialisation_years', type: 'jsonb', default: () => "'{}'::jsonb" })
  specialisationYears!: Record<string, number>;

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

  // ── KYC document keys (PAN card + selfie) ───────────────────────────────
  @Column({ name: 'pan_s3_key', type: 'varchar', length: 512, nullable: true })
  panS3Key!: string | null;

  @Column({ name: 'pan_uploaded_at', type: 'timestamptz', nullable: true })
  panUploadedAt!: Date | null;

  @Column({ name: 'selfie_s3_key', type: 'varchar', length: 512, nullable: true })
  selfieS3Key!: string | null;

  @Column({ name: 'selfie_uploaded_at', type: 'timestamptz', nullable: true })
  selfieUploadedAt!: Date | null;

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
