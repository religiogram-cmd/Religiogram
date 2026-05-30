import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Temple } from '../temples/entities/temple.entity';
import { UserFavorite } from './entities/user-favorite.entity';

/**
 * Favorites surface — the server-backed counterpart to the client's
 * Recently-Viewed strip. Favorites are explicit opt-in bookmarks; they
 * travel with the user across devices, so they live in Postgres rather
 * than localStorage.
 *
 * Read shape
 * ----------
 *   Callers overwhelmingly need:
 *     1. "Is this temple in my favorites?"  (heart button state)
 *     2. "Show me my favorites list"        (the /favorites page)
 *
 *   (1) is cheap and hot — we answer with a bulk `getIds()` so a list of
 *   temples can flip all its hearts from a single DB round-trip.
 *   (2) joins user_favorites to temples and returns full Temple DTOs in
 *   newest-first order.
 *
 * Write shape
 * -----------
 *   add() / remove() are idempotent — repeated adds don't error, repeated
 *   removes delete 0 rows. Keeps the heart button resilient to double-taps
 *   and optimistic UI mismatches without extra client-side bookkeeping.
 */
export interface FavoriteTempleDto {
  id: string;
  name: string;
  city: string;
  state: string | null;
  address: string | null;
  lat: number;
  lng: number;
  ratingAvg: number | null;
  ratingCount: number;
  hours: string | null;
  deity: string | null;
  isVerified: boolean;
  imageUrl: string | null;
  /** When the user favourited — lets the client sort / group if it wants. */
  favouritedAt: string;
}

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @InjectRepository(UserFavorite)
    private readonly favorites: Repository<UserFavorite>,
    @InjectRepository(Temple)
    private readonly temples: Repository<Temple>,
  ) {}

  /**
   * Idempotent add. Uses ON CONFLICT DO NOTHING so repeat taps collapse to
   * a single "favourite" state without throwing. We verify the temple
   * exists first so callers get a clean 404 instead of a cryptic FK error
   * on invalid ids.
   */
  async add(userId: string, templeId: string): Promise<{ added: boolean }> {
    const temple = await this.temples.findOne({
      where: { id: templeId },
      select: ['id'],
    });
    if (!temple) {
      throw new NotFoundException({
        code: 'TEMPLE_NOT_FOUND',
        message: 'Temple not found.',
      });
    }

    // INSERT ... ON CONFLICT DO NOTHING returns 0 affected rows when the
    // pair already exists. We use `xmax = 0` in the RETURNING to detect
    // first-insert vs. no-op, so callers can get an accurate `added`
    // flag for analytics / UI feedback.
    const rows = await this.favorites.query<{ added: boolean }[]>(
      `
      INSERT INTO user_favorites (user_id, temple_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, temple_id) DO NOTHING
      RETURNING TRUE AS added
      `,
      [userId, templeId],
    );
    return { added: rows.length > 0 };
  }

  /**
   * Idempotent remove. Returns { removed: boolean } so the UI can
   * differentiate between "undid a favourite" and "was never a favourite"
   * if it wants to — most call-sites just ignore the field.
   */
  async remove(userId: string, templeId: string): Promise<{ removed: boolean }> {
    const result = await this.favorites.delete({ userId, templeId });
    return { removed: (result.affected ?? 0) > 0 };
  }

  /**
   * Bulk "which of these are favourited?" lookup. One query regardless
   * of list size — the client uses this to paint hearts on a whole
   * TempleList in a single round-trip.
   *
   * Returns a Set for O(1) membership checks in the caller.
   */
  async getFavoriteIds(userId: string, templeIds: string[]): Promise<Set<string>> {
    if (templeIds.length === 0) return new Set();
    const rows = await this.favorites
      .createQueryBuilder('f')
      .select('f.temple_id', 'templeId')
      .where('f.user_id = :userId', { userId })
      .andWhere('f.temple_id IN (:...templeIds)', { templeIds })
      .getRawMany<{ templeId: string }>();
    return new Set(rows.map((r: any) => r.templeId));
  }

  /**
   * List a user's favorites, newest-first, joined to the temples table so
   * the client can render rich cards from a single endpoint.
   *
   * No pagination for v1 — the list is bounded by human behaviour (a few
   * dozen bookmarks at most). If usage patterns prove otherwise we'll
   * page server-side; the index on (user_id, created_at DESC) already
   * supports keyset pagination trivially.
   */
  async list(userId: string): Promise<FavoriteTempleDto[]> {
    const rows = await this.favorites.query<
      Array<{
        id: string;
        name: string;
        city: string;
        state: string | null;
        address: string | null;
        lat: number;
        lng: number;
        rating_avg: string | null;
        rating_count: number;
        hours: string | null;
        deity: string | null;
        is_verified: boolean;
        image_url: string | null;
        favourited_at: Date;
      }>
    >(
      `
      SELECT t.id, t.name, t.city, t.state, t.address,
             t.lat, t.lng, t.rating_avg, t.rating_count,
             t.hours, t.deity, t.is_verified, t.image_url,
             f.created_at AS favourited_at
      FROM user_favorites f
      JOIN temples t ON t.id = f.temple_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId],
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      address: r.address,
      lat: Number(r.lat),
      lng: Number(r.lng),
      ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
      ratingCount: r.rating_count,
      hours: r.hours,
      deity: r.deity,
      isVerified: r.is_verified,
      imageUrl: r.image_url,
      favouritedAt:
        r.favourited_at instanceof Date
          ? r.favourited_at.toISOString()
          : new Date(r.favourited_at).toISOString(),
    }));
  }

  /**
   * Lightweight count — used by the Profile screen to show "⭐ 12 saved"
   * without paying for the full list query.
   */
  async count(userId: string): Promise<number> {
    return this.favorites.count({ where: { userId } });
  }
}
