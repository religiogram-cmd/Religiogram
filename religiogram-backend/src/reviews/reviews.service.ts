import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Review, ReviewableType } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create or update a review. A user can only have one review per entity.
   * On conflict (same user+entity), the existing review is overwritten.
   * After saving, denormalised rating columns are updated on the target entity.
   */
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    // Check if user has a completed booking with this provider (verified purchase)
    const isVerifiedPurchase = await this.checkVerifiedPurchase(
      userId,
      dto.reviewableType,
      dto.reviewableId,
    );

    // Atomic upsert: INSERT ... ON CONFLICT (reviewer_id, reviewable_id, reviewable_type)
    // DO UPDATE — eliminates TOCTOU race where two concurrent requests both pass the
    // findOne check and both insert, causing a unique-constraint violation.
    const result = await this.dataSource.query(
      `INSERT INTO reviews (id, user_id, reviewable_type, reviewable_id, rating, body, is_verified_purchase, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (user_id, reviewable_id, reviewable_type)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         body = EXCLUDED.body,
         is_verified_purchase = EXCLUDED.is_verified_purchase,
         updated_at = NOW()
       RETURNING id`,
      [userId, dto.reviewableType, dto.reviewableId, dto.rating, dto.body ?? null, isVerifiedPurchase],
    );

    if (!result || result.length === 0) {
      throw new ConflictException('You have already reviewed this');
    }

    const savedId: string = result[0].id;
    await this.updateRating(dto.reviewableType, dto.reviewableId);

    const saved = await this.reviewRepo.findOneOrFail({ where: { id: savedId } });
    return saved;
  }

  /**
   * Paginated list of visible reviews for a given entity.
   * Returns reviews with basic user info (name, avatarUrl).
   */
  async list(dto: ListReviewsDto): Promise<{ items: Review[]; total: number }> {
    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;

    const [items, total] = await this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u')
      .where('r.reviewable_type = :type', { type: dto.reviewableType })
      .andWhere('r.reviewable_id = :id', { id: dto.reviewableId })
      .andWhere('r.is_hidden = false')
      .orderBy('r.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getManyAndCount();

    return { items, total };
  }

  /** Delete a user's own review. Recalculates rating after deletion. */
  async delete(userId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    const { reviewableType, reviewableId } = review;
    await this.reviewRepo.remove(review);
    await this.updateRating(reviewableType, reviewableId);
  }

  /**
   * Mark a review as helpful. Any authenticated user can do this once
   * (idempotency enforced at app layer by checking Redis or simply
   * incrementing — for v1 we just increment without uniqueness).
   */
  async markHelpful(reviewId: string): Promise<void> {
    await this.reviewRepo
      .createQueryBuilder()
      .update(Review)
      .set({ helpfulCount: () => 'helpful_count + 1' })
      .where('id = :id', { id: reviewId })
      .execute();
  }

  /**
   * Admin: hide a spammy/abusive review without deleting it.
   * Recalculates rating after hiding.
   */
  async adminHide(reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.isHidden) return; // already hidden, no-op

    review.isHidden = true;
    await this.reviewRepo.save(review);
    await this.updateRating(review.reviewableType, review.reviewableId);
  }

  /**
   * Recalculate the denormalised rating_avg / rating_count on the target
   * entity table (temples or providers) from the reviews table.
   *
   * We use a raw UPDATE … FROM subquery so the recalculation is atomic
   * and doesn't require loading all reviews into memory.
   *
   * The place type maps to the places table which does not yet have rating
   * columns — we log a warning and skip gracefully.
   */
  async updateRating(
    reviewableType: ReviewableType,
    reviewableId: string,
  ): Promise<void> {
    try {
      if (reviewableType === ReviewableType.TEMPLE) {
        await this.dataSource.query(
          `
          UPDATE temples
          SET
            rating_avg   = sub.avg_rating,
            rating_count = sub.cnt
          FROM (
            SELECT
              AVG(rating)::numeric(3,2) AS avg_rating,
              COUNT(*)::int             AS cnt
            FROM reviews
            WHERE reviewable_type = $1
              AND reviewable_id   = $2
              AND is_hidden       = false
          ) sub
          WHERE id = $2
          `,
          [ReviewableType.TEMPLE, reviewableId],
        );
      } else if (reviewableType === ReviewableType.PROVIDER) {
        // providers table uses bigint id but reviewableId is stored as UUID text.
        // The providers.id is bigint so we cast safely.
        await this.dataSource.query(
          `
          UPDATE providers
          SET
            rating_avg   = sub.avg_rating,
            rating_count = sub.cnt
          FROM (
            SELECT
              AVG(rating)::numeric(3,2) AS avg_rating,
              COUNT(*)::int             AS cnt
            FROM reviews
            WHERE reviewable_type = $1
              AND reviewable_id   = $2
              AND is_hidden       = false
          ) sub
          WHERE id::text = $2
          `,
          [ReviewableType.PROVIDER, reviewableId],
        );
      } else {
        // ReviewableType.PLACE — places table rating columns not yet added.
        this.logger.debug(
          `updateRating: skipping place type (no rating columns yet) for id=${reviewableId}`,
        );
      }
    } catch (err) {
      // Non-fatal: log and continue. The review was saved; the denorm update
      // will be reconciled by the next review on this entity.
      this.logger.error(
        `updateRating failed for ${reviewableType}/${reviewableId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Returns true if the user has a completed booking with this provider.
   * Only applies to PROVIDER reviews — always false for temples/places.
   */
  private async checkVerifiedPurchase(
    userId: string,
    reviewableType: ReviewableType,
    reviewableId: string,
  ): Promise<boolean> {
    if (reviewableType !== ReviewableType.PROVIDER) return false;

    try {
      const result = await this.dataSource.query(
        `
        SELECT EXISTS (
          SELECT 1 FROM bookings
          WHERE user_id    = $1
            AND provider_id::text = $2
            AND status     = 'completed'
          LIMIT 1
        ) AS exists
        `,
        [userId, reviewableId],
      );
      return result?.[0]?.exists === true || result?.[0]?.exists === 't';
    } catch {
      // bookings table may not exist in test environments
      return false;
    }
  }

  /** Get a single review by id (for admin/internal use). */
  async findOne(reviewId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
      relations: ['user'],
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }
}
