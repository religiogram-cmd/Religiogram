import { Column, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Booking } from './booking.entity';

@Entity('booking_addons')
@Index('idx_ba_booking', ['bookingId'])
export class BookingAddon {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'addon_name', length: 200 })
  addonName!: string;

  /** Paise */
  @Column({ type: 'bigint' })
  amount!: number;
}
