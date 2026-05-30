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
import { PlaceEvent } from './place-event.entity';
import { User } from '../../users/entities/user.entity';

export type ReminderStatus = 'scheduled' | 'sent' | 'cancelled' | 'failed';

/**
 * EventReminder — a single user's subscription to a notification for
 * one event. The dispatcher (BullMQ worker) scans for
 *   status = 'scheduled' AND sent = false AND remind_at <= now()
 * and flips each batch to `sent` after a successful push.
 */
@Entity('event_reminders')
@Index('IDX_event_reminders_user_remind', ['userId', 'remindAt'])
export class EventReminder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => PlaceEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: PlaceEvent;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /**
   * Dispatch time — usually event.startTime minus a lead time
   * (see REMINDER_LEAD_MS in EventRemindersService).
   */
  @Column({ name: 'remind_at', type: 'timestamptz' })
  remindAt!: Date;

  @Column({
    type: 'varchar',
    enum: ['scheduled', 'sent', 'cancelled', 'failed'],
    enumName: 'reminder_status',
    default: 'scheduled',
  })
  status!: ReminderStatus;

  @Column({ type: 'boolean', default: false })
  sent!: boolean;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  /**
   * Last dispatch error — helps ops figure out why a reminder went to
   * `status = 'failed'`. We don't retry forever: a failed reminder is
   * flipped to 'failed' after 3 attempts (BullMQ retry policy).
   */
  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
