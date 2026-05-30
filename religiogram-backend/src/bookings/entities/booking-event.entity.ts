import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity('booking_events')
@Index('idx_booking_events_booking', ['bookingId'])
export class BookingEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  /** e.g. 'booking.confirmed', 'booking.cancelled', 'booking.payment_failed' */
  @Column({ name: 'event_type', length: 100 })
  eventType!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 50, nullable: true })
  actorRole!: string | null;

  /** Arbitrary metadata snapshot at time of event */
  @Column({ name: 'payload', type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  /** Immutable audit log — no updatedAt */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
