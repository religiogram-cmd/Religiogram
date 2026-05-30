import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProviderEntity } from './provider.entity';

/**
 * availability — per-day time slots a provider is free.
 *
 * Day convention: 0 = Sunday, 6 = Saturday (JS Date.getDay()). Keeping the
 * same convention as the browser means no client-side conversion logic.
 *
 * A single weekly row represents a recurring slot. Exceptions (one-off
 * blackouts) live in a future `availability_overrides` table — out of
 * scope for the onboarding flow.
 *
 * `isBreak = true` represents an explicit lunch/aarti/prayer break. UI
 * renders these as a struck-out band. Nothing prevents overlapping rows,
 * but the frontend slot-picker refuses to create them.
 */
@Entity({ name: 'availability' })
@Index('idx_avail_provider_day', ['providerId', 'dayOfWeek'])
export class AvailabilityEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'provider_id', type: 'bigint' })
  providerId!: string;

  @ManyToOne(() => ProviderEntity, (p: any) => p.availability, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string; // 'HH:MM' or 'HH:MM:SS'

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'is_break', type: 'boolean', default: false })
  isBreak!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
