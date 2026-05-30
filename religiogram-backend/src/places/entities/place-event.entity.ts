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
 * Place event — a prayer time, gathering, festival, or any scheduled
 * activity that happens at a place of worship.
 *
 * Neutrality note
 * ---------------
 * We intentionally do NOT carry a `kind` column (prayer | festival |
 * ceremony). The title/description are the source of truth and avoid
 * baking any religion-specific taxonomy into the schema. A facet column
 * can be bolted on later if product actually wants faceted filtering.
 *
 * Recurrence
 * ----------
 * `recurring` is a boolean flag only — it lets the UI badge "recurring"
 * on obvious daily prayers without us having to expand calendar entries
 * up front. When we ship the calendar view, this column will be
 * superseded by an `rrule` column + a materialised-instances helper.
 *
 * Soft vs hard delete
 * -------------------
 * Hard delete for v1. Admin curation; no user-generated events yet.
 * When reviews / attendance logging lands, we'll switch to soft delete
 * to preserve analytic references.
 */
@Entity('place_events')
@Index('IDX_place_events_place_start', ['placeId', 'startTime'])
export class PlaceEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * FK → temples.id. Column name kept as `place_id` so the schema
   * reads neutrally even though the physical table it points at is
   * still called `temples`. See migration 1700000000008.
   */
  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  /**
   * ManyToOne is declared but NOT eager-loaded. The /places/:id route
   * already fetches the place via TemplesService (cached), so loading
   * it again via this relation would double the work. Reserve the
   * relation for places → events joins from the admin side.
   */
  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Temple;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Event start; used for sorting ("upcoming first") and filtering. */
  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  /** Optional end time. Null for "all day" / indefinite gatherings. */
  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime!: Date | null;

  @Column({ type: 'boolean', default: false })
  recurring!: boolean;

  /**
   * Moderation soft-hide flag (migration 1700000000011).
   *
   * Flipped to `true` when an admin approves a report against this
   * event. Public readers filter `WHERE is_hidden = false`; the row
   * is preserved for audit + appeal + un-hide. A partial index on
   * (place_id, start_time) WHERE is_hidden = false keeps the hot
   * "upcoming events for this place" query on a small, tight B-tree.
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
