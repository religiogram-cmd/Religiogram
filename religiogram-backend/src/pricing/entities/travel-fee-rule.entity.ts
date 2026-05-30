import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('travel_fee_rules')
@Index('idx_travel_fee_km', ['maxKm'])
export class TravelFeeRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'min_km', type: 'int', default: 0 })
  minKm!: number;

  @Column({ name: 'max_km', type: 'int' })
  maxKm!: number;

  @Column({ name: 'flat_fee_paise', type: 'int' })
  flatFeePaise!: number; // base fee for the bracket

  @Column({ name: 'per_km_above_paise', type: 'int', default: 0 })
  perKmAbovePaise!: number; // extra per km beyond minKm

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
