import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('availability_slots')
@Index('idx_avail_slot_provider_day', ['providerId', 'dayOfWeek'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  @Index('idx_avail_slot_provider')
  providerId!: string;

  /** 0 = Sunday, 1 = Monday ... 6 = Saturday */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  /** HH:MM format e.g. '09:00' */
  @Column({ name: 'start_time', length: 5 })
  startTime!: string;

  /** HH:MM format e.g. '18:00' */
  @Column({ name: 'end_time', length: 5 })
  endTime!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
