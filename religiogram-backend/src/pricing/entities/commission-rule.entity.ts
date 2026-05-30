import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('commission_rules')
@Index('idx_commission_rules_religion_service', ['religionSlug', 'serviceId'])
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'religion_slug', nullable: true, type: 'varchar' })
  religionSlug!: string | null;

  @Column({ name: 'service_id', nullable: true, type: 'varchar' })
  serviceId!: string | null;

  @Column({ name: 'provider_role', nullable: true, type: 'varchar' })
  providerRole!: string | null;

  @Column({
    name: 'base_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 15.0,
  })
  basePct!: number;

  @Column({ name: 'min_fee_paise', type: 'int', nullable: true })
  minFeePaise!: number | null;

  @Column({ name: 'max_fee_paise', type: 'int', nullable: true })
  maxFeePaise!: number | null;

  @Column({ name: 'surge_enabled', default: false })
  surgeEnabled!: boolean;

  @Column({
    name: 'surge_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  surgePct!: number;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo!: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
