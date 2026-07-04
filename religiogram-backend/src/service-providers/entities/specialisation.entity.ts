import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Specialisation master (migration 070).
 *
 * Source of truth for the astrology / spiritual specialisation catalogue.
 * Providers pick from this list during Step 3 of the astrologer flow and
 * their picks are stored on `providers.specialisations text[]` by *name*
 * (not by id) so the marketplace filter can stay a simple GIN array query.
 *
 * The name-not-id approach also means renames need to be careful: if you
 * change the display label of an existing row, existing provider rows
 * still reference the old string until a backfill runs. Add an `alias`
 * column later if this becomes routine.
 *
 * Category:
 *   'astrology'   — Vedic, KP, Nadi, etc.
 *   'divination'  — Tarot, Numerology, Palmistry
 *   'healing'     — Reiki, Chakra, Gemstone
 *   'home_energy' — Vastu, Feng Shui
 *   'spiritual'   — Meditation, Manifestation
 *   (free-form varchar so admin can add categories without a migration)
 */
@Entity({ name: 'specialisations' })
@Index('idx_specialisations_active_sort', ['isActive', 'sortOrder'])
@Index('idx_specialisations_category', ['category'])
export class SpecialisationEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  /** URL/slug-friendly identifier. Immutable. Used by admin URLs; providers
   *  still reference specs by `name`. */
  @Column({ name: 'slug', type: 'varchar', length: 80, unique: true })
  slug!: string;

  /** Display name shown to providers and devotees. Renaming = careful. */
  @Column({ name: 'name', type: 'varchar', length: 80 })
  name!: string;

  /** Category bucket for grouping in the picker UI. */
  @Column({ name: 'category', type: 'varchar', length: 40 })
  category!: string;

  /** Optional short description shown in admin only. */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  /** Sort order within its category. Lower = earlier. Ties break by name. */
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder!: number;

  /** Soft-delete: setting this false hides the spec from the picker but
   *  keeps existing provider references intact. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** Highlighted with a badge in the picker to help new devotees find
   *  popular practices faster. */
  @Column({ name: 'is_trending', type: 'boolean', default: false })
  isTrending!: boolean;

  /** Reserved for future premium-tier gating. Not enforced yet. */
  @Column({ name: 'is_premium_only', type: 'boolean', default: false })
  isPremiumOnly!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
