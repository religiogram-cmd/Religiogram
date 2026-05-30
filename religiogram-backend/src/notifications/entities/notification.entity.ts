import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum NotificationType {
  // Bookings & payments
  BOOKING_CONFIRMED    = 'booking_confirmed',
  BOOKING_CANCELLED    = 'booking_cancelled',
  BOOKING_COMPLETED    = 'booking_completed',
  BOOKING_REMINDER     = 'booking_reminder',
  PAYMENT_SUCCESS      = 'payment_success',
  PAYMENT_FAILED       = 'payment_failed',
  PAYOUT_PROCESSED     = 'payout_processed',
  // Consultations
  CONSULTATION_STARTED = 'consultation_started',
  CONSULTATION_ENDED   = 'consultation_ended',
  // Social — community
  POST_LIKED           = 'post_liked',
  POST_COMMENTED       = 'post_commented',
  FRIEND_REQUEST       = 'friend_request',
  FRIEND_ACCEPTED      = 'friend_accepted',
  NEW_MESSAGE          = 'new_message',
  NEW_DM               = 'new_dm',
  // Reviews & misc
  REVIEW_RECEIVED      = 'review_received',
  SYSTEM               = 'system',
}

/**
 * N1: Add dedup_key for idempotent notification creation.
 * Partial unique index on (user_id, type, dedup_key) prevents duplicate
 * notifications for the same event (e.g. double-fire from retry logic).
 */
@Entity('notifications')
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
@Index('idx_notifications_user_unread', ['userId', 'isRead'])
// N1: partial unique constraint is in migration 052 (WHERE dedup_key IS NOT NULL)
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'type', type: 'varchar', enum: NotificationType })
  type!: NotificationType;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'data', type: 'jsonb', nullable: true })
  data!: Record<string, string> | null;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  /**
   * N1: Deduplication key — caller-supplied, stable identifier for the event
   * that triggered this notification (e.g. bookingId, postId+userId, etc.).
   * Stored as a short hash or opaque string. Combined with (user_id, type) in
   * a partial unique index so the same event never creates two notifications.
   */
  @Column({ name: 'dedup_key', type: 'varchar', length: 128, nullable: true })
  dedupKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
