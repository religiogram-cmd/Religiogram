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
import { Temple } from '../../temples/entities/temple.entity';

/**
 * Place service — a non-temporal offering at a place of worship.
 *
 * Examples the UI ships with (all editable per-place by admins):
 *   - Prayer Services
 *   - Community Kitchen
 *   - Ceremonies
 *   - Counselling / Guidance
 *
 * Display order
 * -------------
 * v1 sorts by `created_at ASC` (oldest first, which tends to match the
 * admin's intentional ordering). A `sort_order int` can be added later
 * without a data migration — defaults to created_at if null.
 */
@Entity('place_services')
@Index('IDX_place_services_place', ['placeId', 'createdAt'])
export class PlaceService {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Temple;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Moderation soft-hide flag (migration 1700000000011). See
   * PlaceEvent.isHidden for the rationale and index strategy.
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
