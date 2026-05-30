import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('availability_overrides')
@Index('idx_avail_override_provider_date', ['providerId', 'date'])
export class AvailabilityOverride {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  @Index('idx_avail_override_provider')
  providerId!: string;

  @Column({ name: 'date', type: 'date' })
  date!: string;

  @Column({ name: 'is_blocked', default: true })
  isBlocked!: boolean;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
