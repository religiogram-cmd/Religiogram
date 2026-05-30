import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '../../auth/interfaces/jwt-payload.interface';

export type AuthProvider = 'phone' | 'google' | 'email';

export enum AccountStatus {
  ACTIVE                = 'active',
  SUSPENDED             = 'suspended',
  BANNED                = 'banned',
  PENDING_VERIFICATION  = 'pending_verification',
}

/**
 * User entity -- supports both OTP (phone) and Google OAuth (email) signups.
 * At least one of phone or email must be non-null (DB-level check constraint).
 */
@Entity('users')
@Index('UQ_users_google_id', ['googleId'], {
  unique: true,
  where: 'google_id IS NOT NULL',
})
@Index('idx_users_country_city', ['country', 'city'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('UQ_users_phone', { unique: true, where: 'phone IS NOT NULL' })
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Index('UQ_users_email', { unique: true, where: 'email IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'phone' })
  provider!: AuthProvider;

  /** bcrypt hash -- null for OTP/Google-only users. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  /** Google's unique user ID -- null for OTP-only users */
  @Column({ name: 'google_id', type: 'varchar', length: 100, nullable: true })
  googleId!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  /** Kept for backward compat; mirrors first_name + last_name */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 150, nullable: true })
  displayName!: string | null;

  @Column({ type: 'text', name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @Index('UQ_users_username', { unique: true, where: 'username IS NOT NULL' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  username!: string | null;

  @Column({
    name: 'account_type',
    type: 'varchar',
    length: 20,
    default: 'user',
  })
  accountType!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender?: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ name: 'religion_preference_id', nullable: true })
  religionPreferenceId?: string;

  /** User-declared faith. One of: all | hindu | muslim | sikh | christian.
   * Drives Holy Places + Priests faceting on the client. Nullable so existing
   * accounts before the column landed remain valid. */
  @Column({ name: 'faith', type: 'varchar', length: 20, nullable: true })
  faith?: string | null;

  @Column({ name: 'preferred_language', length: 10, default: 'en' })
  preferredLanguage!: string;

  @Column({ length: 100, nullable: true })
  city?: string;

  @Column({ length: 100, nullable: true })
  state?: string;

  @Column({ length: 2, default: 'IN' })
  country!: string;

  @Column({ name: 'postal_code', length: 20, nullable: true })
  postalCode?: string;

  @Column({ length: 50, default: 'Asia/Kolkata' })
  timezone!: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'seeker' })
  role!: UserRole;

  @Column({
    name: 'account_status',
    type: 'varchar',
    length: 30,
    default: AccountStatus.ACTIVE,
  })
  accountStatus!: AccountStatus;

  @Column({ name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ name: 'phone_verified', default: false })
  phoneVerified!: boolean;

  /** @deprecated use accountStatus instead */
  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;

  /** @deprecated use accountStatus instead */
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'profile_complete', default: false })
  profileComplete!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'last_login_ip', type: 'inet', nullable: true })
  lastLoginIp!: string | null;

  @Column({ name: 'last_device_id', type: 'varchar', length: 100, nullable: true })
  lastDeviceId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @BeforeInsert()
  @BeforeUpdate()
  syncNameField(): void {
    if (!this.name && (this.firstName || this.lastName)) {
      this.name = [this.firstName, this.lastName].filter(Boolean).join(' ');
    }
    if (!this.displayName && (this.firstName || this.lastName || this.name)) {
      this.displayName = this.firstName || this.name || this.lastName || null;
    }
  }

  get resolvedDisplayName(): string {
    return this.displayName
      || this.username
      || (this.firstName && this.lastName ? `${this.firstName} ${this.lastName}` : null)
      || this.firstName
      || this.name
      || 'Anonymous';
  }
}
