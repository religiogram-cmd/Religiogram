import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProviderReligion } from './provider.entity';

/**
 * services_master — curated catalogue of services per religion.
 *
 * Seeded from the 1700000000013-SeedServicesMaster migration. Not
 * user-writable from the onboarding flow (admin-only). Providers who need
 * a service not in the catalogue select "Other Service" in the UI, which
 * routes through provider_services.custom_name instead.
 *
 * suggested_min/max prices and duration are just display hints — the
 * frontend shows them next to the input so the provider knows the typical
 * range. They're not enforced server-side: a senior priest may legitimately
 * charge above the range, and discounted offers may fall below.
 */
@Entity({ name: 'services_master' })
@Unique('uq_services_religion_slug', ['religion', 'slug'])
@Index('idx_services_religion_category', ['religion', 'category', 'sortOrder'])
export class ServiceMasterEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'religion', type: 'varchar', enum: ProviderReligion })
  religion!: ProviderReligion;

  @Column({ name: 'category', type: 'varchar', length: 80 })
  category!: string;

  @Column({ name: 'name', type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'slug', type: 'varchar', length: 200 })
  slug!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'suggested_min_price', type: 'int', nullable: true })
  suggestedMinPrice!: number | null;

  @Column({ name: 'suggested_max_price', type: 'int', nullable: true })
  suggestedMaxPrice!: number | null;

  @Column({ name: 'suggested_duration_minutes', type: 'int', nullable: true })
  suggestedDurationMinutes!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
