import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { Temple } from '../temples/entities/temple.entity';
import {
  CreateTempleDto,
  ListAdminTemplesDto,
  UpdateTempleDto,
} from './dto/upsert-temple.dto';

export interface AdminTempleDto {
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
  createdAt: string;
  updatedAt: string;
}

export interface AdminListResult {
  items: AdminTempleDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Admin CRUD for the temples table.
 *
 * Responsibilities
 * ----------------
 *   - Persist `lat` / `lng` in both scalar columns *and* the PostGIS
 *     `location` geography. The scalar columns are kept in sync via a
 *     raw UPDATE when coords change — no trigger, because this is the
 *     only code path that writes coords and we'd rather keep the SQL
 *     honest about what's happening.
 *   - Invalidate the `/nearby` and `/search` Redis caches on any write.
 *     We don't scan for matching keys — the data set is small enough
 *     that a blunt prefix delete via a SCAN loop isn't worth the
 *     complexity. Instead we bump a namespace version (see the
 *     "cache busting" section) so stale keys expire via TTL while new
 *     reads build the next-version cache.
 *   - Never expose the `location` column in responses — admins don't
 *     need the geography type, and shrinking the payload keeps the
 *     dashboard snappy.
 *
 * Security
 * --------
 *   Guarded by JwtAuthGuard + RolesGuard(@Roles('admin')) at the
 *   controller. This service assumes the caller is already authorised
 *   and does no additional checks.
 */
@Injectable()
export class AdminTemplesService {
  private readonly logger = new Logger(AdminTemplesService.name);

  constructor(
    @InjectRepository(Temple) private readonly temples: Repository<Temple>,
    private readonly redis: RedisService,
  ) {}

  /* ──────────────── Write paths ──────────────── */

  async create(dto: CreateTempleDto): Promise<AdminTempleDto> {
    // Fuzzy dup check using pg_trgm similarity. A simple `LOWER(name) = LOWER(...)`
    // equality miss on near-duplicates like "Kashi Vishwanath" vs
    // "Shri Kashi Vishwanath Temple" — exactly the editorial problem we want
    // to catch BEFORE the row lands in the index. Similarity >= 0.6 is tight
    // enough that "Ram Mandir" vs "Hanuman Mandir" won't falsely collide,
    // loose enough to flag the prefix/suffix variants that commonly slip in.
    //
    // The extension `pg_trgm` is created by the temples migration. See
    // src/migrations/1700000000004-CreateTemples.ts.
    if (!dto.force) {
      const nearDup = await this.findSimilarInCity(dto.name, dto.city);
      if (nearDup) {
        throw new ConflictException({
          code: 'TEMPLE_NEAR_DUPLICATE',
          message:
            `A similar temple already exists in ${dto.city}: ` +
            `"${nearDup.name}" (similarity ${nearDup.similarity.toFixed(2)}). ` +
            `Resubmit with { "force": true } if you're sure they're distinct.`,
          existingTempleId: nearDup.id,
          similarity: nearDup.similarity,
        });
      }
    }

    // Insert via raw query so ST_SetSRID can set the geography in the
    // same round trip — saves us a two-step flow.
    const rows = await this.temples.query<{ id: string }[]>(
      `
      INSERT INTO temples (
        name, city, state, address,
        location, lat, lng,
        rating_avg, rating_count, hours, deity, is_verified, image_url
      ) VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
      RETURNING id
      `,
      [
        dto.name,
        dto.city,
        dto.state ?? null,
        dto.address ?? null,
        dto.lat,
        dto.lng,
        dto.ratingAvg ?? null,
        dto.ratingCount ?? 0,
        dto.hours ?? null,
        dto.deity ?? null,
        dto.isVerified ?? false,
        dto.imageUrl ?? null,
      ],
    );
    const id = rows[0].id;
    await this.bustCaches();
    return this.getOne(id);
  }

  /**
   * Returns the highest-similarity same-city temple whose trigram score is
   * >= 0.6 against the proposed name. Null when nothing is close enough.
   *
   * Scoped to `LOWER(city) = LOWER(:city)` because two different cities with
   * the same temple name is valid (every city has a Hanuman Mandir). The
   * index used is `IDX_temples_name_trgm` which pg_trgm added in the temples
   * migration; `similarity()` is an O(log n) lookup there.
   */
  private async findSimilarInCity(
    name: string,
    city: string,
  ): Promise<{ id: string; name: string; similarity: number } | null> {
    const rows = await this.temples.query<
      { id: string; name: string; similarity: number }[]
    >(
      `
      SELECT id, name, similarity(LOWER(name), LOWER($1)) AS similarity
      FROM temples
      WHERE LOWER(city) = LOWER($2)
        AND similarity(LOWER(name), LOWER($1)) >= 0.6
      ORDER BY similarity DESC
      LIMIT 1
      `,
      [name, city],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, similarity: Number(r.similarity) };
  }

  async update(id: string, dto: UpdateTempleDto): Promise<AdminTempleDto> {
    const existing = await this.temples.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Temple not found');

    // Build the SET clause dynamically so partial updates stay cheap.
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (dto.name !== undefined) push('name', dto.name);
    if (dto.city !== undefined) push('city', dto.city);
    if (dto.state !== undefined) push('state', dto.state);
    if (dto.address !== undefined) push('address', dto.address);
    if (dto.ratingAvg !== undefined) push('rating_avg', dto.ratingAvg);
    if (dto.ratingCount !== undefined) push('rating_count', dto.ratingCount);
    if (dto.hours !== undefined) push('hours', dto.hours);
    if (dto.deity !== undefined) push('deity', dto.deity);
    if (dto.isVerified !== undefined) push('is_verified', dto.isVerified);
    if (dto.imageUrl !== undefined) push('image_url', dto.imageUrl);

    // Coords need to update both scalars AND the geography — handle as a
    // single atomic step so a read can never see them out of sync.
    const coordsChanged = dto.lat !== undefined || dto.lng !== undefined;
    if (coordsChanged) {
      const lat = dto.lat ?? Number(existing.lat);
      const lng = dto.lng ?? Number(existing.lng);
      push('lat', lat);
      push('lng', lng);
      params.push(lng);
      params.push(lat);
      sets.push(
        `location = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography`,
      );
    }

    if (sets.length === 0) {
      // No-op update — just return the current state.
      return this.getOne(id);
    }

    // Always bump updated_at.
    sets.push(`updated_at = now()`);
    params.push(id);

    await this.temples.query(
      `UPDATE temples SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    await this.bustCaches();
    return this.getOne(id);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const res = await this.temples.delete({ id });
    if (!res.affected) throw new NotFoundException('Temple not found');
    await this.bustCaches();
    return { id, deleted: true };
  }

  /* ──────────────── Read paths ──────────────── */

  async list(dto: ListAdminTemplesDto): Promise<AdminListResult> {
    // Admin offset pagination is acceptable for internal use but cap to prevent abuse
    const safePage  = Math.max(1, dto.page ?? 1);
    const safeLimit = Math.min(100, dto.limit ?? 20);
    const qb = this.temples.createQueryBuilder('t');

    if (dto.search) {
      const like = `%${dto.search.trim()}%`;
      qb.andWhere('(t.name ILIKE :like OR t.city ILIKE :like OR t.address ILIKE :like)', {
        like,
      });
    }
    if (dto.city) {
      qb.andWhere('LOWER(t.city) = LOWER(:city)', { city: dto.city });
    }
    if (!dto.includeUnverified) {
      qb.andWhere('t.isVerified = true');
    }

    // Admins generally want most-recently-changed first — they're
    // auditing their own edits, not browsing a catalogue.
    qb.orderBy('t.updatedAt', 'DESC');

    const [items, total] = await qb
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items: items.map((t: Temple) => this.entityToAdminDto(t)),
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async getOne(id: string): Promise<AdminTempleDto> {
    const t = await this.temples.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Temple not found');
    return this.entityToAdminDto(t);
  }

  /* ──────────────── Cache invalidation ──────────────── */

  /**
   * Bump the cache namespace version.
   *
   * All read paths (`/nearby`, `/search`) include this version in their
   * cache keys — e.g. `temples:v7:nearby:28.613:77.209:r5:l30`. A single
   * INCR therefore orphans every pre-existing cache key in one atomic
   * command. The orphans die naturally when their TTL expires (5 min
   * nearby, 60 s search); there is no SCAN/DEL fan-out and no thundering
   * herd at invalidation time.
   *
   * We deliberately do NOT DEL the old keys. The small amount of RAM
   * they occupy for up to 5 minutes is cheaper than a prefix-delete
   * scan across a busy cluster, and Redis will recycle them via the
   * configured eviction policy (allkeys-lru in production).
   *
   * Failure mode: if Redis is unreachable, writes still succeed and the
   * worst case is the old TTL-based invalidation behaviour. We log a
   * warning so infra can alert on it, but we never throw — an admin
   * edit should not be blocked by a cache outage.
   */
  private async bustCaches(): Promise<void> {
    try {
      const next = await this.redis.incr('temples:cache:version');
      this.logger.log(`temples cache bumped to v${next}`);
    } catch (err) {
      this.logger.warn(`cache-version INCR failed: ${(err as Error).message}`);
    }
  }

  private entityToAdminDto(t: Temple): AdminTempleDto {
    return {
      id: t.id,
      name: t.name,
      city: t.city,
      state: t.state,
      address: t.address,
      lat: Number(t.lat),
      lng: Number(t.lng),
      ratingAvg: t.ratingAvg === null ? null : Number(t.ratingAvg),
      ratingCount: t.ratingCount,
      hours: t.hours,
      deity: t.deity,
      isVerified: t.isVerified,
      imageUrl: t.imageUrl,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
