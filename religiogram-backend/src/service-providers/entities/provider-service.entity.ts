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
import { ProviderEntity } from './provider.entity';
import { ServiceMasterEntity } from './service-master.entity';

export enum ServiceMode {
  Online = 'online',
  Offline = 'offline',
  Both = 'both',
}

/**
 * provider_services — a provider's offered services with per-service pricing.
 *
 * Rules (enforced by CHECK constraint at DB level):
 *   - Either `serviceId` is set (catalogue item) OR `customName` is set ("Other").
 *   - Never both.
 *
 * Prices are stored in paise (INT) everywhere to avoid floating-point drift.
 * Pricing formula at read time:
 *
 *    final = base_price + addon_fee + travel_fee + platform_fee
 *
 * `platform_fee` is computed dynamically at display/booking time from the
 * current fee schedule — we don't freeze it into provider_services because
 * the platform fee can change while the service listing doesn't.
 */
@Entity({ name: 'provider_services' })
@Index('idx_ps_provider', ['providerId', 'isActive'])
export class ProviderServiceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'provider_id', type: 'bigint' })
  providerId!: string;

  @ManyToOne(() => ProviderEntity, (p: any) => p.services, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({ name: 'service_id', type: 'bigint', nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => ServiceMasterEntity, { nullable: true })
  @JoinColumn({ name: 'service_id' })
  service?: ServiceMasterEntity | null;

  @Column({ name: 'custom_name', type: 'varchar', length: 160, nullable: true })
  customName!: string | null;

  @Column({ name: 'base_price_paise', type: 'int' })
  basePricePaise!: number;

  @Column({ name: 'travel_fee_paise', type: 'int', default: 0 })
  travelFeePaise!: number;

  @Column({ name: 'addon_fee_paise', type: 'int', default: 0 })
  addonFeePaise!: number;

  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes!: number;

  @Column({ name: 'mode', type: 'varchar', enum: ServiceMode })
  mode!: ServiceMode;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
