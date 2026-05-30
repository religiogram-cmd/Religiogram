import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('provider_slot_locks')
@Index('idx_psl_provider_slot', ['providerId', 'slotStart'])
@Index('idx_psl_user', ['lockedByUserId'])
@Index('idx_psl_expires', ['expiresAt'])
export class ProviderSlotLock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  providerId!: string;

  @Column({ name: 'service_id' })
  serviceId!: string;

  @Column({ name: 'slot_start', type: 'timestamptz' })
  slotStart!: Date;

  @Column({ name: 'slot_end', type: 'timestamptz' })
  slotEnd!: Date;

  @Column({ name: 'locked_by_user_id' })
  lockedByUserId!: string;

  @CreateDateColumn({ name: 'locked_at', type: 'timestamptz' })
  lockedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'converted_to_booking_id', nullable: true })
  convertedToBookingId?: string;
}
