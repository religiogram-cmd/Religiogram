import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * v6 (recovery): user-file.entity.ts was truncated in the v3 zip.
 * Reconstructed from uploads.service.ts call sites (createPresign / confirm /
 * sweepExpired) and matched against the audit description of the upload flow.
 */
export type FileKind = 'profile' | 'document' | 'certificate';
export type FileStatus = 'pending' | 'confirmed' | 'scanned' | 'quarantined';

@Entity('user_files')
@Index('idx_user_files_user_kind', ['userId', 'kind'])
@Index('idx_user_files_status_created', ['status', 'createdAt'])
export class UserFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: FileKind;

  /** Canonical S3 / R2 key. Tenant-scoped: users/{userId}/{folder}/{fileId}{ext} */
  @Column({ type: 'varchar', length: 1024 })
  key!: string;

  /** Public read URL (CDN-fronted in production). */
  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType!: string;

  /** Size in bytes — stored as bigint because S3 reports it that way. */
  @Column({
    name: 'size_bytes',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string | null) => (v === null ? 0 : Number(v)) },
  })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: FileStatus;

  @Column({ name: 'original_name', type: 'varchar', length: 255, nullable: true })
  originalName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
