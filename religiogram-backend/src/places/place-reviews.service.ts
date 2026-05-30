import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceReview } from './entities/place-review.entity';
import { Temple } from '../temples/entities/temple.entity';
import { RedisService } from '../redis/redis.service';

/* ── DTOs ────────────────────────────────────────────────────────────── */

export interface CreateReviewDto {
  rating: number;          // 1-5
  body?: string;
  visitDate?: string;      // ISO date string e.g. "2025-01-15"
  photoUrls?: string[];    // up to 5 S3 URLs
}

export interface ReviewDto {
  id: string;
  placeId: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  rating: number;
  body: string | null;
  helpfulCount: number;
  visitDate: string | null;
  photoUrls: string[];
  createdAt: string;
}

export interface ReviewsPageDto {
  reviews: ReviewDto[];
  total: number;
  nextCursor?: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  distribution: Record<1|2|3|4|5, number>;
}

const CACHE_TTL = 3 * 60; // 3 minutes
const MAX_PHOTOS_PER_REVIEW = 5;

@Injectable()
export class PlaceReviewsService {
  private readonly logger = new Logger(PlaceReviewsService.name);

  constructor(
    @InjectRepository(PlaceReview)
    private readonly reviewRepo: Repository<PlaceReview>,
    @InjectRepository(Temple)
    private readonly templeRepo: Repository<Temple>,
    private readonly redis: RedisService,
  ) {}

  /* ── Public reads ───────────────────────────────────────────────── */

  async listReviews(
    placeId: string,
    opts: { cursor?: string; limit?: number; sort?: 'newest' | 'highest' | 'helpful' } = {},
  ): Promise<ReviewsPageDto> {
    await this.requirePlace(placeId);

    const limit = Math.min(50, Math.max(1, opts.limit ?? 10));
    const sort  = opts.sort ?? 'newest';
    const cursor = opts.cursor;
    const cacheKey = `place_reviews:${placeId}:c${cursor ?? ''}:l${limit}:s${sort}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as ReviewsPageDto; } catch { /* fall through */ }
    }

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u')
      .leftJoinAndSelect('u.profile', 'p')
      .where('r.placeId = :placeId', { placeId })
      .andWhere('r.isHidden = false');

    switch (sort) {
      case 'highest':  qb.orderBy('r.rating', 'DESC').addOrderBy('r.createdAt', 'DESC'); break;
      case 'helpful':  qb.orderBy('r.helpfulCount', 'DESC').addOrderBy('r.createdAt', 'DESC'); break;
      default:         qb.orderBy('r.createdAt', 'DESC');
    }

    // Keyset cursor pagination — O(log n) via (createdAt, id) index
    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere(
          '(r.createdAt < :afterDate OR (r.createdAt = :afterDate AND r.id < :afterId))',
          { afterDate: d, afterId: i },
        );
      } catch { /* invalid cursor — ignore, start from beginning */ }
    }
    const rows = await qb.take(limit + 1).getMany();
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const total = -1; // not computed with keyset pagination

    // Rating distribution
    const distRows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.placeId = :placeId', { placeId })
      .andWhere('r.isHidden = false')
      .groupBy('r.rating')
      .getRawMany<{ rating: string; cnt: string }>();

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distRows) distribution[Number(d.rating)] = Number(d.cnt);

    // Re-read ratingAvg from temple row (kept fresh by trigger)
    const temple = await this.templeRepo.findOne({
      where: { id: placeId },
      select: { id: true, ratingAvg: true, ratingCount: true },
    });

    // Build nextCursor from last item
    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow
      ? Buffer.from(JSON.stringify({ d: lastRow.createdAt.toISOString(), i: lastRow.id })).toString('base64url')
      : null;

    const dto: ReviewsPageDto = {
      reviews: rows.map((r) => this.toDto(r)),
      total: rows.length,
      nextCursor,
      ratingAvg: temple?.ratingAvg != null ? Number(temple.ratingAvg) : null,
      ratingCount: temple?.ratingCount ?? 0,
      distribution: distribution as Record<1|2|3|4|5, number>,
    };

    await this.redis.set(cacheKey, JSON.stringify(dto), 'EX', CACHE_TTL).catch(() => {});
    return dto;
  }

  async getMyReview(placeId: string, userId: string): Promise<ReviewDto | null> {
    const row = await this.reviewRepo.findOne({
      where: { placeId, userId, isHidden: false },
      relations: ['user', 'user.profile'],
    });
    return row ? this.toDto(row) : null;
  }

  /* ── Mutations ───────────────────────────────────────────────────── */

  /**
   * Upsert a review: if the user already has an active review for this
   * place, update it; otherwise insert. Returns the saved DTO.
   */
  async upsertReview(
    placeId: string,
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    await this.requirePlace(placeId);

    if (dto.rating < 1 || dto.rating > 5 || !Number.isInteger(dto.rating)) {
      throw new BadRequestException('rating must be an integer 1–5');
    }
    if (dto.photoUrls && dto.photoUrls.length > MAX_PHOTOS_PER_REVIEW) {
      throw new BadRequestException(`Maximum ${MAX_PHOTOS_PER_REVIEW} photos per review`);
    }

    let row = await this.reviewRepo.findOne({ where: { placeId, userId } });

    if (row && row.isHidden) {
      // Hidden → treat as non-existent; create a new one
      row = undefined as unknown as typeof row;
    }

    if (row) {
      // Update existing review
      row.rating    = dto.rating;
      row.body      = dto.body ?? null;
      row.photoUrls = dto.photoUrls ?? [];
      if (dto.visitDate) row.visitDate = new Date(dto.visitDate);
    } else {
      row = this.reviewRepo.create({
        placeId,
        userId,
        rating:     dto.rating,
        body:       dto.body ?? null,
        photoUrls:  dto.photoUrls ?? [],
        visitDate:  dto.visitDate ? new Date(dto.visitDate) : null,
      });
    }

    const saved = await this.reviewRepo.save(row);
    await this.bustCaches(placeId);
    return this.toDto(saved);
  }

  async deleteReview(placeId: string, userId: string): Promise<{ removed: boolean }> {
    const row = await this.reviewRepo.findOne({ where: { placeId, userId } });
    if (!row) return { removed: false };
    await this.reviewRepo.remove(row);
    await this.bustCaches(placeId);
    return { removed: true };
  }

  async markHelpful(reviewId: string): Promise<{ helpfulCount: number }> {
    const row = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!row) throw new NotFoundException('Review not found');
    row.helpfulCount += 1;
    const saved = await this.reviewRepo.save(row);
    return { helpfulCount: saved.helpfulCount };
  }

  /* ── Internals ───────────────────────────────────────────────────── */

  private async requirePlace(id: string): Promise<void> {
    const exists = await this.templeRepo
      .createQueryBuilder('t').select('1').where('t.id = :id', { id }).getRawOne();
    if (!exists) throw new NotFoundException('Place not found');
  }

  private async bustCaches(placeId: string): Promise<void> {
    try {
      await this.redis.scanDelete(`place_reviews:${placeId}:*`);
    } catch (err) {
      this.logger.warn(`review cache bust failed: ${(err as Error).message}`);
    }
  }

  private toDto(r: PlaceReview): ReviewDto {
    // r.user may not be loaded in all paths
    type UserWithProfile = typeof r & { user?: { profile?: { displayName?: string; avatarUrl?: string }; phone?: string } };
    const rw = r as UserWithProfile;
    const profile = rw.user?.profile;
    return {
      id:           r.id,
      placeId:      r.placeId,
      userId:       r.userId,
      userName:     profile?.displayName ?? rw.user?.phone ?? null,
      userAvatar:   profile?.avatarUrl ?? null,
      rating:       r.rating,
      body:         r.body,
      helpfulCount: r.helpfulCount,
      visitDate:    r.visitDate ? r.visitDate.toISOString().slice(0, 10) : null,
      photoUrls:    r.photoUrls ?? [],
      createdAt:    r.createdAt.toISOString(),
    };
  }
}
