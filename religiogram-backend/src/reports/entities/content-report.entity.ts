import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Temple } from '../../temples/entities/temple.entity';
import { User } from '../../users/entities/user.entity';

export type ReportTargetType = 'event' | 'service';
export type ReportStatus = 'pending' | 'reviewed' | 'rejected';

/**
 * ContentReport — a user flag against a single place_events or
 * place_services row.
 *
 * Why an opaque `target_id` instead of two nullable FKs?
 *   Keeping one column keeps the dedup UNIQUE INDEX simple and lets
 *   us add new target types (reviews, photos, …) without schema churn.
 *   The price is the loss of a hard FK — we compensate with a CASCADE
 *   delete via the target's row being soft-hidden; the report row
 *   itself is kept for audit.
 *
 * Status lifecycle (see migration 1700000000011):
 *   pending   → fresh submission from the user
 *   reviewed  → admin approved → target row was hidden
 *   rejected  → admin dismissed → target untouched
 *
 * The report row is never hard-deleted by the user once created; the
 * user may only withdraw via admin action. This avoids the abuse
 * pattern of "flag → watch response → withdraw" repeated at scale.
 */
@Entity('content_reports')
@Index('IDX_content_reports_status_created', ['status', 'createdAt'])
@Index('IDX_content_reports_target', ['targetType', 'targetId'])
@Index('IDX_content_reports_place_created', ['placeId', 'createdAt'])
export class ContentReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /**
   * place_id is denormalised on the row so the admin UI's "by place"
   * filter is a single WHERE (no JOIN through events/services). The
   * service layer always sets this to the parent place of the target.
   */
  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Temple;

  @Column({
    name: 'target_type',
    type: 'varchar',
    enum: ['event', 'service'],
    enumName: 'report_target_type',
  })
  targetType!: ReportTargetType;

  /**
   * UUID of the flagged row. No hard FK because a single column can
   * point into two tables — see the entity doc-comment above.
   */
  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'varchar',
    enum: ['pending', 'reviewed', 'rejected'],
    enumName: 'report_status',
    default: 'pending',
  })
  status!: ReportStatus;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
