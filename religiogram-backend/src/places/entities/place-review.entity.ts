import {
  Check,
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
import { User } from '../../users/entities/user.entity';

/**
 * PlaceReview — a 1-5 star rating + optional text review from a user
 * for a place of worship.
 *
 * One active (non-hidden) review per (user, place) is enforced by
 * a partial unique index in migration 024. Submitting again when a
 * review already exists returns the existing row (update semantics
 * from the service layer).
 *
 * Aggregation: a Postgres trigger (trg_place_rating) keeps
 * temples.rating_avg and temples.rating_count in sync on every
 * INSERT / UPDATE / DELETE on this table — no periodic job needed.
 *
 * photo_urls: donors can attach up to 5 photos (S3 URLs). Validated
 * in the service layer; the entity stores whatever the service writes.
 */
@Entity('place_reviews')
@Index('IDX_place_reviews_place', ['placeId', 'createdAt'])
@Check('"rating" >= 1 AND "rating" <= 5')
export class PlaceReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'place_id', type: 'uuid' })
  placeId!: string;

  @ManyToOne(() => Temple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Temple;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Star rating, 1–5. */
  @Column({ type: 'smallint' })
  rating!: number;

  /** Optional prose review body. */
  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /**
   * Soft-hide flag: set by admin on moderation.
   * Hidden reviews are excluded from public reads and the aggregate trigger
   * will recalculate ratingAvg/ratingCount to exclude them.
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  /** Thumbs-up count from other users ("helpful"). Incremented in-place. */
  @Column({ name: 'helpful_count', type: 'int', default: 0 })
  helpfulCount!: number;

  /** Optional date of visit — shown to help readers gauge recency. */
  @Column({ name: 'visit_date', type: 'date', nullable: true })
  visitDate!: Date | null;

  /** Up to 5 photo URLs attached to the review. */
  @Column({ name: 'photo_urls', type: 'text', array: true, default: [] })
  photoUrls!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
