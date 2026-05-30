import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED      = 'fixed',
}

@Entity('discount_codes')
export class DiscountCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 30, unique: true })
  code!: string; // e.g. "FIRST10"

  @Column({ name: 'discount_type', type: 'varchar', length: 20 })
  discountType!: DiscountType;

  @Column({ name: 'value', type: 'numeric', precision: 8, scale: 2 })
  value!: number; // pct (0-100) or paise

  @Column({ name: 'max_discount_paise', type: 'int', nullable: true })
  maxDiscountPaise!: number | null; // cap on pct discounts

  @Column({ name: 'min_order_paise', type: 'int', default: 0 })
  minOrderPaise!: number; // minimum order to use

  @Column({ name: 'max_uses', type: 'int', nullable: true })
  maxUses!: number | null; // null = unlimited

  @Column({ name: 'uses_count', type: 'int', default: 0 })
  usesCount!: number;

  @Column({ name: 'max_uses_per_user', type: 'int', default: 1 })
  maxUsesPerUser!: number;

  @Column({ name: 'religion_slug', type: 'varchar', length: 30, nullable: true })
  religionSlug!: string | null; // restrict to religion

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
