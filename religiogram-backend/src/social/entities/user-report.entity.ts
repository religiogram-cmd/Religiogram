import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type UserReportTargetType = 'post' | 'comment' | 'user' | 'message';
export type UserReportStatus     = 'pending' | 'resolved' | 'rejected';

/**
 * user_reports — user-submitted moderation reports. Unique on
 * (reporter, target_type, target_id) so a double-submit from the client is
 * a no-op instead of a duplicate row.
 */
@Entity({ name: 'user_reports' })
@Index('idx_user_reports_status', ['status'])
@Unique('uq_user_reports_reporter_target', ['reporterId', 'targetType', 'targetId'])
export class UserReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType!: UserReportTargetType;

  /** UUID (post/comment/user) or short id (message). Stored as varchar. */
  @Column({ name: 'target_id', type: 'varchar', length: 64 })
  targetId!: string;

  @Column({ name: 'reason', type: 'varchar', length: 50 })
  reason!: string;

  @Column({ name: 'details', type: 'text', nullable: true })
  details!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status!: UserReportStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolver_admin_id', type: 'uuid', nullable: true })
  resolverAdminId!: string | null;
}
