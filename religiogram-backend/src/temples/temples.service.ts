import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { resolveCity } from '../common/config/cities.config';
import { RedisService } from '../redis/redis.service';
import { ListTemplesDto } from './dto/list-temples.dto';
import { NearbyTemplesDto } from './dto/nearby-temples.dto';
import { SearchTemplesDto } from './dto/search-temples.dto';
import { Temple } from './entities/temple.entity';

/**
 * Row shape returned by the PostGIS query for /nearby. Includes a derived
 * `distance_m` column from ST_Distance so the client can render "2.3 km".
 */
interface NearbyRow {
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
  distance_m: number;
}

export interface TempleDto {
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
  /** Distance from the query point in metres — only present on /nearby responses. */
  distanceM?: number;
}

export interface ListResult {
  items: TempleDto[];
  total?: number;
  page?: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

/**
 * Cache TTL for /nearby responses.
 *
 * 5 minutes is the sweet spot: long enough that a user scrolling the list +
 * switching to map + back hits cache for free, short enough that a newly-
 * verified temple propagates within the same session.
 */
const NEARBY_CACHE_TTL_SECONDS = 5 * 60;

/**
 * Round lat/lng to 3 decimals (~110 m) for cache key bucketing.
 */
function roundCoord(n: number): string {
  return n.toFixed(3);
}

const CACHE_VERSION_KEY = 'temples:cache:version';
const VERSION_MEMO_TTL_MS = 1000;

@Injectable()
export class TemplesService {
  private readonly logger = new Logger(TemplesService.name);

  /** Memoised version read — (value, fetchedAt). */
  private versionMemo: { value: string; fetchedAt: number } | null = null;

  constructor(
    @InjectRepository(Temple) private readonly temples: Repository<Temple>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Returns the current cache-namespace version.
   */
  private async getCacheVersion(): Promise<string> {
    const now = Date.now();
    if (this.versionMemo && now - this.versionMemo.fetchedAt < VERSION_MEMO_TTL_MS) {
      return this.versionMemo.value;
    }
    try {
      const v = (await this.redis.get(CACHE_VERSION_KEY)) ?? '0';
      this.versionMemo = { value: v, fetchedAt: now };
      return v;
    } catch {
      return '0';
    }
  }

  /* ──────────────── /nearby ──────────────── */

  /**
   * Radius query backed by PostGIS GIST index.
   */
  async nearby(dto: NearbyTemplesDto): Promise<TempleDto[]> {
    const centre = this.resolveCentre(dto);
    const version = await this.getCacheVersion();

    const cacheKey = `temples:v${version}:nearby:${roundCoord(centre.lat)}:${roundCoord(
      centre.lng,
    )}:r${dto.radiusKm}:l${dto.limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TempleDto[];
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const radiusMetres = dto.radiusKm * 1000;

    const rows = await this.temples.query<NearbyRow[]>(
      `
      SELECT
        id, name, city, state, address, lat, lng,
        rating_avg, rating_count, hours, deity, is_verified, image_url,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distance_m
      FROM temples
      WHERE ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      ORDER BY distance_m ASC
      LIMIT $4
      `,
      [centre.lng, centre.lat, radiusMetres, dto.limit],
    );

    const result = rows.map((r: any) => this.rowToDto(r, r.distance_m));

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        NEARBY_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `nearby cache write failed: ${(err as Error).message}`,
      );
    }

    return result;
  }

  /* ──────────────── /temples (list + search) ──────────────── */

  /**
   * Paged list for the "All India" tab.
   */
  async list(dto: ListTemplesDto & { cursor?: string }): Promise<ListResult> {
    const limit = Math.min(50, Math.max(1, dto.limit ?? 20));

    let afterDate: number | undefined;
    let afterId: string | undefined;
    let afterVerified: number | undefined;
    if (dto.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(dto.cursor, 'base64url').toString());
        afterVerified = decoded.v !== undefined ? decoded.v : undefined;
        afterDate = decoded.r ?? (decoded.d !== undefined ? decoded.d : undefined);
        afterId = decoded.i;
      } catch { /* ignore invalid cursor */ }
    }

    const qb = this.temples
      .createQueryBuilder('t')
      .select([
        't.id',
        't.name',
        't.city',
        't.state',
        't.address',
        't.lat',
        't.lng',
        't.ratingAvg',
        't.ratingCount',
        't.hours',
        't.deity',
        't.isVerified',
        't.imageUrl',
      ]);

    if (dto.search?.trim()) {
      const q = `%${dto.search.trim().toLowerCase()}%`;
      qb.where(
        '(LOWER(t.name) LIKE :q OR LOWER(t.city) LIKE :q OR LOWER(t.deity) LIKE :q)',
        { q },
      );
    }

    if (dto.city?.trim()) {
      qb.andWhere('LOWER(t.city) = :city', {
        city: dto.city.trim().toLowerCase(),
      });
    }

    if ((dto as any).placeType?.trim()) {
      qb.andWhere('LOWER(t.type) = :placeType', {
        placeType: (dto as any).placeType.trim().toLowerCase(),
      });
    }

    if (afterId !== undefined && afterDate !== undefined) {
      if (afterVerified !== undefined) {
        // Full three-field cursor: isVerified DESC, ratingAvg DESC, id ASC
        qb.andWhere(
          `(t.isVerified < :cv OR (t.isVerified = :cv AND t.ratingAvg < :cr) OR (t.isVerified = :cv AND t.ratingAvg = :cr AND t.id > :ci))`,
          { cv: afterVerified === 1, cr: afterDate, ci: afterId },
        );
      } else {
        // Backwards compat: old cursors without v field
        qb.andWhere(
          '(t.ratingAvg < :afterRating OR (t.ratingAvg = :afterRating AND t.id > :afterId))',
          { afterRating: afterDate, afterId },
        );
      }
    }

    qb.orderBy('t.isVerified', 'DESC')
      .addOrderBy('t.ratingAvg', 'DESC', 'NULLS LAST')
      .addOrderBy('t.id', 'DESC')
      .take(limit + 1);

    const raw = await qb.getMany();
    const hasMore = raw.length > limit;
    if (hasMore) raw.pop();

    const items: TempleDto[] = raw.map((t: any) => ({
      id:          t.id,
      name:        t.name,
      city:        t.city,
      state:       t.state ?? null,
      address:     t.address ?? null,
      lat:         t.lat,
      lng:         t.lng,
      ratingAvg:   t.ratingAvg !== null ? parseFloat(t.ratingAvg as unknown as string) : null,
      ratingCount: t.ratingCount,
      hours:       t.hours ?? null,
      deity:       t.deity ?? null,
      isVerified:  t.isVerified,
      imageUrl:    t.imageUrl ?? null,
    }));

    const lastRow = raw.length > 0 ? raw[raw.length - 1] : null;
    const nextCursor = hasMore && lastRow
      ? Buffer.from(JSON.stringify({
          v: lastRow.isVerified ? 1 : 0,
          r: lastRow.ratingAvg,
          i: lastRow.id,
        })).toString('base64url')
      : null;

    return {
      items,
      limit,
      hasMore,
      nextCursor,
    };
  }

  /* ──────────────── /temples/search ──────────────── */

  /**
   * Full-text search using pg_tsvector GIN index.
   */
  async search(dto: SearchTemplesDto): Promise<TempleDto[]> {
    const q = dto.q?.trim();
    if (!q) return [];

    // Sanitise: keep word chars + spaces, strip SQL meta chars
    const safe = q.replace(/[^\w\sऀ-ॿ]/g, '').trim();
    if (!safe) return [];

    const tsQuery = safe
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(' & ');

    const rows = await this.temples
      .createQueryBuilder('t')
      .select([
        't.id',
        't.name',
        't.city',
        't.state',
        't.address',
        't.lat',
        't.lng',
        't.ratingAvg',
        't.ratingCount',
        't.hours',
        't.deity',
        't.isVerified',
        't.imageUrl',
      ])
      .where(
        `to_tsvector('simple', t.name || ' ' || t.city || ' ' || COALESCE(t.deity, '')) @@ to_tsquery('simple', :tsQuery)`,
        { tsQuery },
      )
      .orderBy('t.isVerified', 'DESC')
      .addOrderBy('t.ratingAvg', 'DESC', 'NULLS LAST')
      .limit(30)
      .getMany();

    return rows.map((t: any) => ({
      id:          t.id,
      name:        t.name,
      city:        t.city,
      state:       t.state ?? null,
      address:     t.address ?? null,
      lat:         t.lat,
      lng:         t.lng,
      ratingAvg:   t.ratingAvg !== null ? parseFloat(t.ratingAvg as unknown as string) : null,
      ratingCount: t.ratingCount,
      hours:       t.hours ?? null,
      deity:       t.deity ?? null,
      isVerified:  t.isVerified,
      imageUrl:    t.imageUrl ?? null,
    }));
  }

  /* ──────────────── /temples/:id ──────────────── */

  async findById(id: string): Promise<Temple> {
    const temple = await this.temples.findOne({ where: { id } });
    if (!temple) throw new NotFoundException(`Temple ${id} not found`);
    return temple;
  }

  /* ──────────────── /temples/cities ──────────────── */

  /**
   * Returns a sorted list of distinct city slugs that have at least one
   * verified temple. Used by the client to populate a city picker.
   */
  async findCities(): Promise<string[]> {
    const rows = await this.temples
      .createQueryBuilder('t')
      .select('DISTINCT t.city', 'city')
      .where('t.isVerified = true')
      .orderBy('t.city', 'ASC')
      .getRawMany<{ city: string }>();

    return rows.map((r: any) => r.city);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolves a query centre from the DTO.
   * Explicit lat/lng always wins; falls back to city centre.
   */
  private resolveCentre(dto: NearbyTemplesDto): { lat: number; lng: number } {
    if (dto.lat !== undefined && dto.lng !== undefined) {
      return { lat: dto.lat, lng: dto.lng };
    }
    if (dto.city) {
      const city = resolveCity(dto.city);
      if (city) return city;
    }
    throw new BadRequestException(
      'Either lat+lng or a known city slug is required for /nearby',
    );
  }

  /**
   * Maps a NearbyRow (raw SQL result) to TempleDto.
   */
  private rowToDto(r: NearbyRow, distanceM?: number): TempleDto {
    return {
      id:          r.id,
      name:        r.name,
      city:        r.city,
      state:       r.state,
      address:     r.address,
      lat:         Number(r.lat),
      lng:         Number(r.lng),
      ratingAvg:   r.rating_avg !== null ? parseFloat(r.rating_avg) : null,
      ratingCount: Number(r.rating_count),
      hours:       r.hours,
      deity:       r.deity,
      isVerified:  r.is_verified,
      imageUrl:    r.image_url,
      distanceM,
    };
  }
}
