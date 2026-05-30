import {
  Column, CreateDateColumn, Entity, ManyToOne, JoinColumn,
  OneToMany, PrimaryGeneratedColumn, Index,
} from 'typeorm';
import { ServiceCategory } from './service-category.entity';
import { ServiceAddOn } from './service-addon.entity';

export enum ServiceType {
  OFFLINE = 'offline',
  ONLINE  = 'online',
  BOTH    = 'both',
}

@Entity('catalog_services')
@Index('idx_catalog_services_category', ['categoryId'])
@Index('idx_catalog_services_slug', ['slug'], { unique: true })
export class CatalogService {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_id' })
  categoryId!: string;

  @ManyToOne(() => ServiceCategory, (c: any) => c.services)
  @JoinColumn({ name: 'category_id' })
  category!: ServiceCategory;

  @Column({ length: 100, unique: true })
  slug!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'service_type', type: 'varchar', default: ServiceType.OFFLINE })
  serviceType!: ServiceType;

  @Column({ name: 'default_duration_min', type: 'int', default: 120 })
  defaultDurationMin!: number;

  /** Stored in paise (x100) */
  @Column({ name: 'min_price_paise', type: 'int', default: 50000 })
  minPricePaise!: number;

  @Column({ name: 'max_price_paise', type: 'int', default: 500000 })
  maxPricePaise!: number;

  @Column({ name: 'platform_commission_pct', type: 'numeric', precision: 5, scale: 2, default: 15.00 })
  platformCommissionPct!: number;

  @Column({ name: 'cancellation_policy', type: 'jsonb', default: '{"tiers":[{"hoursBeforeMin":48,"refundPct":100},{"hoursBeforeMin":24,"refundPct":50},{"hoursBeforeMin":0,"refundPct":0}]}' })
  cancellationPolicy!: object;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: object;

  @Column({ name: 'rg_price_paise', type: 'bigint', nullable: true })
  rgPricePaise!: number | null;

  @Column({ name: 'market_min_paise', type: 'bigint', nullable: true })
  marketMinPaise!: number | null;

  @Column({ name: 'market_max_paise', type: 'bigint', nullable: true })
  marketMaxPaise!: number | null;

  @Column({ name: 'sensitive', type: 'boolean', default: false })
  sensitive!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => ServiceAddOn, (a: any) => a.service)
  addOns!: ServiceAddOn[];
}
