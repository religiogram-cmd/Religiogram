import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('holiday_surges')
@Index('idx_holiday_surges_dates', ['startDate', 'endDate'])
export class HolidaySurge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string; // e.g. "Navratri Oct 2026"

  @Column({ name: 'religion_slug', type: 'varchar', length: 30, nullable: true })
  religionSlug!: string | null; // null = applies to all

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string; // YYYY-MM-DD

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string; // YYYY-MM-DD

  @Column({ name: 'multiplier', type: 'numeric', precision: 4, scale: 2, default: 1.3 })
  multiplier!: number; // max 1.5, enforced in service

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
