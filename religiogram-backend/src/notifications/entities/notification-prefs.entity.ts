import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-user notification channel preferences.
 * PK = user_id (one row per user). Missing row is treated as defaults by
 * NotificationsService.getPrefs, so this table can lazily populate on first
 * explicit update without a mandatory backfill on user signup.
 */
@Entity({ name: 'notification_prefs' })
export class NotificationPrefs {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'push_enabled', type: 'boolean', default: true })
  pushEnabled!: boolean;

  @Column({ name: 'email_enabled', type: 'boolean', default: true })
  emailEnabled!: boolean;

  @Column({ name: 'sms_enabled', type: 'boolean', default: true })
  smsEnabled!: boolean;

  @Column({ name: 'marketing_enabled', type: 'boolean', default: false })
  marketingEnabled!: boolean;

  /** 0–23 in the user's local timezone. NULL = no DND window. */
  @Column({ name: 'dnd_start_hour', type: 'smallint', nullable: true })
  dndStartHour!: number | null;

  @Column({ name: 'dnd_end_hour', type: 'smallint', nullable: true })
  dndEndHour!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
