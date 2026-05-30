import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AdminRole {
  SUPER_ADMIN  = 'super_admin',
  OPS_ADMIN    = 'ops_admin',
  SUPPORT      = 'support',
  FINANCE      = 'finance',
  VERIFIER     = 'verifier',
}

export enum AdminStatus { ACTIVE = 'active', SUSPENDED = 'suspended' }

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email!: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 30, default: AdminRole.SUPPORT })
  role!: AdminRole;

  @Column({ type: 'varchar', length: 20, default: AdminStatus.ACTIVE })
  status!: AdminStatus;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'mfa_secret_encrypted', type: 'text', nullable: true })
  mfaSecretEncrypted?: string;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
