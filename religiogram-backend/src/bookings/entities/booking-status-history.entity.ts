import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Booking } from './booking.entity';

export enum ActorType { USER = 'user', PROVIDER = 'provider', SYSTEM = 'system', ADMIN = 'admin' }

@Entity('booking_status_history')
@Index('idx_bsh_booking', ['bookingId'])
export class BookingStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'previous_status', length: 30, nullable: true })
  previousStatus?: string;

  @Column({ name: 'new_status', length: 30 })
  newStatus!: string;

  @Column({ name: 'changed_by_type', type: 'varchar', length: 20 })
  changedByType!: ActorType;

  @Column({ name: 'changed_by_id', nullable: true })
  changedById?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
