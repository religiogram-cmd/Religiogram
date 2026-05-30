import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { Temple } from '../temples/entities/temple.entity';
import { PlaceEvent } from './entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from './entities/place-service.entity';
import type {
  CreatePlaceEventDto,
  UpdatePlaceEventDto,
} from './dto/upsert-place-event.dto';
import type {
  CreatePlaceServiceDto,
  UpdatePlaceServiceDto,
} from './dto/upsert-place-service.dto';

/**
 * Place type — neutral discriminator across denominations.
 */
export type PlaceType = 'temple' | 'mosque' | 'church' | 'gurudwara' | 'other';

/**
 * Public DTO shape returned by GET /places/:id.
 *
 * Mirrors TempleDto but adds `type` — the schema is shared (same row,
 * same table) but the vocabulary is neutralised at the edge.
 *
 * `distanceKm` is optional and only populated when the caller supplied
 * a `userLat` / `userLng` query. Null when the place has no usable
 * coordinates. We return kilometres (not metres) because the UI shows
 * human-friendly "2.3 km" and would otherwise divide by 1000 everywhere.
 */
export interface PlaceDto {
  id: string;
  type: PlaceType;
  name: string;
  city: string;
  state: string | null;
  address: string | null;
  lat: number;
  lng: number;
  ratingAvg: number | null;
  ratingCount: number;
  openingHours: string | null;
  imageUrl: string | null;
  galleryUrls: string[];
  googlePlaceId: string | null;
  description: string | null;
  donationEnabled: boolean;
  donationUpiId: string | null;
  ownerId: string | null;
  isVerified: boolean;
  /** Great-circle distance from the user, in kilometres. Optional. */
  distanceKm?: number | null;
}

export interface PlaceEventDto {
  id: string;
  placeId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  recurring: boolean;
  createdAt: string;
}

export interface PlaceServiceDto {
  id: string;
  placeId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

/**
 * Detailed response shape for /places/:id. Embeds the next few events
 * and the full services list in a single round-trip so the profile page
 * renders in one fetch. Callers that need the long tail pull it from
 * the dedicated /events and /services routes.
 */
export interface PlaceDetailDto extends PlaceDto {
  upcomingEvents: PlaceEventDto[];
  services: PlaceServiceDto[];
}

/**
 * Shape for entries in the /places/:id/nearby response.
 * Kept light (no events/services) since the UI shows a compact card.
 */
export interface NearbyPlaceDto {
  id: string;
  type: PlaceType;
  name: string;
  city: string;
  state: string | null;
  imageUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isVerified: boolean;
  distanceKm: number;
}

/* ── Cache knobs ──────────────────────────────────────────────────────────
 *
 * Place profile pages are hit ~5-10× more often than any single /nearby
 * result (a single share link can get thousands of views). We cache the
 * detail blob aggressively and bust by version when events/services mutate.
 *
 * Versioning follows the same pattern as `temples.service.ts`:
 *   INCR places:cache:version  →  every read key prepends the value
 *                                  → in-process 1 s memo to avoid the RTT
 */
const PLACE_DETAIL_CACHE_TTL_SECONDS = 10 * 60;   // 10 min
const PLACE_EVENTS_CACHE_TTL_SECONDS = 5 * 60;    // 5 min  (list is smaller + admin-curated)
const PLACE_SERVICES_CACHE_TTL_SECONDS = 30 * 60; // 30 min (services change rarely)
const PLACE_NEARBY_CACHE_TTL_SECONDS = 5 * 60;    // 5 min  (matches /temples/nearby)

const CACHE_VERSION_KEY = 'places:cache:version';
const VERSION_MEMO_TTL_MS = 1000;

/** Upcoming events bundled into the detail response. */
const EMBED_EVENT_LIMIT = 10;

/** Default radius for "nearby places". 15 km covers most metros. */
const NEARBY_RADIUS_DEFAULT_KM = 15;
const NEARBY_RADIUS_MIN_KM = 1;
const NEARBY_RADIUS_MAX_KM = 50;
const NEARBY_LIMIT_DEFAULT = 10;
const NEARBY_LIMIT_MAX = 20;

/** Round lat/lng to 3 decimals (~110 m) for cache key bucketing. */
function roundCoord(n: number): string {
  return n.toFixed(3);
}

/**
 * Row shape for the nearby raw query. We pull a few more columns than
 * the list card needs so we can also compute the `/places/:id/nearby`
 * response without another round-trip.
 */
interface NearbyRow {
  id: string;
  type: PlaceType;
  name: string;
  city: string;
  state: string | null;
  rating_avg: string | null;
  rating_count: number;
  is_verified: boolean;
  image_url: string | null;
  distance_m: number;
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private versionMemo: { value: string; fetchedAt: number } | null = null;

  constructor(
    @InjectRepository(Temple)
    private readonly places: Repository<Temple>,
    @InjectRepository(PlaceEvent)
    private readonly events: Repository<PlaceEvent>,
    @InjectRepository(PlaceServiceEntity)
    private readonly services: Repository<PlaceServiceEntity>,
    private readonly redis: RedisService,
  ) {}

  /* ──────────────── cache-version plumbing ──────────────── */

  private async getCacheVersion(): Promise<string> {
    const now = Date.now();
    if (
      this.versionMemo &&
      now - this.versionMemo.fetchedAt < VERSION_MEMO_TTL_MS
    ) {
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

  /**
   * Admin mutations on events / services call this to orphan the cache.
   * Only the `places:*` namespace is bumped — temple list / nearby caches
   * live under their own `temples:cache:version` and aren't affected.
   */
  async bustCaches(): Promise<void> {
    try {
      await this.redis.incr(CACHE_VERSION_KEY);
      this.versionMemo = null;
    } catch (err) {
      this.logger.warn(
        `places cache version bump failed: ${(err as Error).message}`,
      );
    }
  }

  /* ──────────────── public reads ──────────────── */

  /**
   * Full place profile in one round-trip:
   *   - base place row (name, coords, rating, hours, image, type)
   *   - next 10 upcoming events (excluding hidden)
   *   - full services list (excluding hidden)
   *
   * `userCoords` is optional. When present, a `distanceKm` field is
   * computed via Haversine on the lat/lng columns (no PostGIS round-trip
   * since the place row already carries its coords). A cache miss pays
   * only the existing SELECT cost plus a few floating-point ops.
   *
   * IMPORTANT: We do NOT fold `userCoords` into the cache key. Doing so
   * would shatter the cache across every viewer location and defeat the
   * whole point of the detail cache. Instead we cache the location-free
   * blob and layer `distanceKm` on afterwards.
   */
  async getDetail(
    id: string,
    userCoords?: { lat: number; lng: number } | null,
  ): Promise<PlaceDetailDto> {
    const version = await this.getCacheVersion();
    const cacheKey = `places:v${version}:detail:${id}`;

    let dto: PlaceDetailDto | null = null;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        dto = JSON.parse(cached) as PlaceDetailDto;
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    if (!dto) {
      const row = await this.places.findOne({ where: { id } });
      if (!row) throw new NotFoundException('Place not found');

      // Run the two dependent lookups in parallel — they touch different
      // tables, so there's no lock contention. The N+1 trap only shows up
      // when you loop places; here we're fetching one.
      //
      // We call the "unchecked" variants because `row` already proves the
      // place exists; redoing the existence check inside listServices would
      // add one round-trip on every cold read for no extra safety.
      const [events, services] = await Promise.all([
        this.listUpcomingEvents(id, EMBED_EVENT_LIMIT),
        this.listServicesUnchecked(id),
      ]);

      dto = {
        ...this.toPlaceDto(row),
        upcomingEvents: events,
        services,
      };

      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(dto),
          'EX',
          PLACE_DETAIL_CACHE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(
          `place detail cache write failed: ${(err as Error).message}`,
        );
      }
    }

    // Distance is computed AFTER cache read/write so we don't poison the
    // cache with one user's coordinates. Cheap Haversine on two doubles.
    if (userCoords && Number.isFinite(dto.lat) && Number.isFinite(dto.lng)) {
      dto = {
        ...dto,
        distanceKm: haversineKm(userCoords.lat, userCoords.lng, dto.lat, dto.lng),
      };
    }

    return dto;
  }

  /**
   * Dedicated events list. Used by the "See all events" drill-down and
   * when the caller already has the place base fields cached.
   *
   * Hidden events (moderated away) are filtered unconditionally from
   * public reads. The admin surface uses the "manage" endpoints which
   * bypass this filter.
   */
  async listEvents(
    placeId: string,
    opts: { upcomingOnly?: boolean; limit?: number } = {},
  ): Promise<PlaceEventDto[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const upcomingOnly = opts.upcomingOnly ?? true;

    const version = await this.getCacheVersion();
    const cacheKey = `places:v${version}:events:${placeId}:u${upcomingOnly ? 1 : 0}:l${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as PlaceEventDto[];
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    // Existence check — caller could pass a bogus id.
    await this.requirePlace(placeId);

    const qb = this.events
      .createQueryBuilder('e')
      .where('e.placeId = :placeId', { placeId })
      .andWhere('e.isHidden = false');

    if (upcomingOnly) {
      qb.andWhere('(e.endTime IS NULL OR e.endTime >= now())');
    }

    const rows = await qb
      .orderBy('e.startTime', 'ASC')
      .take(limit)
      .getMany();

    const dto = rows.map((r: any) => this.toEventDto(r));

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(dto),
        'EX',
        PLACE_EVENTS_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `place events cache write failed: ${(err as Error).message}`,
      );
    }

    return dto;
  }

  async listServices(placeId: string): Promise<PlaceServiceDto[]> {
    await this.requirePlace(placeId);
    return this.listServicesUnchecked(placeId);
  }

  /**
   * Cached services list without the existence precheck. Callers that
   * already hold a valid place row (e.g. getDetail) can use this to save
   * the `SELECT 1 FROM temples` round-trip.
   */
  private async listServicesUnchecked(
    placeId: string,
  ): Promise<PlaceServiceDto[]> {
    const version = await this.getCacheVersion();
    const cacheKey = `places:v${version}:services:${placeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as PlaceServiceDto[];
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const rows = await this.services.find({
      where: { placeId, isHidden: false },
      order: { createdAt: 'ASC' },
    });
    const dto = rows.map((r: any) => this.toServiceDto(r));

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(dto),
        'EX',
        PLACE_SERVICES_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `place services cache write failed: ${(err as Error).message}`,
      );
    }

    return dto;
  }

  /* ──────────────── /places/:id/nearby ──────────────── */

  /**
   * "Other places near this one" — discovery surface under the profile.
   *
   * Strategy:
   *   - Use the caller's (lat, lng) if provided (the user's device),
   *     otherwise fall back to the anchor place's own coordinates so
   *     an unauth'd / location-denied user still sees meaningful
   *     nearby results (they're looking at a place for a reason).
   *   - PostGIS `ST_DWithin` prunes to the radius via the GIST index;
   *     `ST_Distance` gives us the sort key. Same shape as the temples
   *     /nearby query — we stay consistent so both code paths share the
   *     index.
   *   - Exclude the current place from results so the UI never shows a
   *     "nearby" card that points back at the page the user is on.
   *
   * Cache key buckets lat/lng to 3 decimals (~110 m). A viewer wandering
   * inside the bucket gets the cached list; crossing the boundary pays
   * for a fresh PostGIS probe. 5-min TTL matches the analog in temples.
   */
  async listNearby(
    anchorPlaceId: string,
    opts: { lat?: number; lng?: number; radiusKm?: number; limit?: number } = {},
  ): Promise<NearbyPlaceDto[]> {
    // Resolve the centre point. Caller's location wins; otherwise the
    // anchor place's own lat/lng. Without a centre there's nothing to
    // compute, so we 400.
    const anchor = await this.places.findOne({
      where: { id: anchorPlaceId },
      select: { id: true, lat: true, lng: true },
    });
    if (!anchor) throw new NotFoundException('Place not found');

    const lat =
      Number.isFinite(opts.lat) && opts.lat !== undefined
        ? Number(opts.lat)
        : Number(anchor.lat);
    const lng =
      Number.isFinite(opts.lng) && opts.lng !== undefined
        ? Number(opts.lng)
        : Number(anchor.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('No usable coordinates to query nearby');
    }

    const radiusKm = clamp(
      opts.radiusKm ?? NEARBY_RADIUS_DEFAULT_KM,
      NEARBY_RADIUS_MIN_KM,
      NEARBY_RADIUS_MAX_KM,
    );
    const limit = clamp(opts.limit ?? NEARBY_LIMIT_DEFAULT, 1, NEARBY_LIMIT_MAX);

    const version = await this.getCacheVersion();
    const cacheKey = `places:v${version}:nearby:${anchorPlaceId}:${roundCoord(lat)}:${roundCoord(lng)}:r${radiusKm}:l${limit}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as NearbyPlaceDto[];
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    // Raw SQL — TypeORM's qb can't express ST_MakePoint cleanly and we
    // need ST_Distance in the SELECT. Excludes the anchor place.
    const rows = await this.places.query<NearbyRow[]>(
      `
      SELECT
        id, type, name, city, state, rating_avg, rating_count,
        is_verified, image_url,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distance_m
      FROM temples
      WHERE id != $5
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY distance_m ASC
      LIMIT $4
      `,
      [lng, lat, radiusKm * 1000, limit, anchorPlaceId],
    );

    const result: NearbyPlaceDto[] = rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      city: r.city,
      state: r.state,
      imageUrl: r.image_url,
      ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
      ratingCount: r.rating_count,
      isVerified: r.is_verified,
      distanceKm: Number((r.distance_m / 1000).toFixed(2)),
    }));

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        PLACE_NEARBY_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `nearby places cache write failed: ${(err as Error).message}`,
      );
    }

    return result;
  }

  /* ──────────────── admin writes (events) ──────────────── */

  async createEvent(
    placeId: string,
    dto: CreatePlaceEventDto,
  ): Promise<PlaceEventDto> {
    await this.requirePlace(placeId);
    this.validateEventWindow(dto.startTime, dto.endTime);

    const entity = this.events.create({
      placeId,
      title: dto.title,
      description: dto.description ?? null,
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      recurring: dto.recurring ?? false,
    });
    const saved = await this.events.save(entity);
    await this.bustCaches();
    return this.toEventDto(saved);
  }

  async updateEvent(
    placeId: string,
    eventId: string,
    dto: UpdatePlaceEventDto,
  ): Promise<PlaceEventDto> {
    const existing = await this.events.findOne({
      where: { id: eventId, placeId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    // Merge first so the window check sees the post-update state — a
    // partial update that only moves startTime still has to respect
    // the existing endTime.
    const dtoE = dto as Record<string, unknown>;
    if (dtoE['title'] !== undefined) existing.title = dtoE['title'] as string;
    if (dtoE['description'] !== undefined)
      existing.description = (dtoE['description'] as string) ?? null;
    if (dtoE['startTime'] !== undefined) existing.startTime = new Date(dtoE['startTime'] as string);
    if (dtoE['endTime'] !== undefined)
      existing.endTime = dtoE['endTime'] ? new Date(dtoE['endTime'] as string) : null;
    if (dtoE['recurring'] !== undefined) existing.recurring = dtoE['recurring'] as boolean;

    this.validateEventWindow(
      existing.startTime.toISOString(),
      existing.endTime ? existing.endTime.toISOString() : undefined,
    );

    const saved = await this.events.save(existing);
    await this.bustCaches();
    return this.toEventDto(saved);
  }

  async deleteEvent(placeId: string, eventId: string): Promise<{ removed: boolean }> {
    const res = await this.events.delete({ id: eventId, placeId });
    await this.bustCaches();
    return { removed: (res.affected ?? 0) > 0 };
  }

  /* ──────────────── admin writes (services) ──────────────── */

  async createService(
    placeId: string,
    dto: CreatePlaceServiceDto,
  ): Promise<PlaceServiceDto> {
    await this.requirePlace(placeId);

    const entity = this.services.create({
      placeId,
      name: dto.name,
      description: dto.description ?? null,
    });
    const saved = await this.services.save(entity);
    await this.bustCaches();
    return this.toServiceDto(saved);
  }

  async updateService(
    placeId: string,
    serviceId: string,
    dto: UpdatePlaceServiceDto,
  ): Promise<PlaceServiceDto> {
    const existing = await this.services.findOne({
      where: { id: serviceId, placeId },
    });
    if (!existing) throw new NotFoundException('Service not found');

    const dtoS = dto as Record<string, unknown>;
    if (dtoS['name'] !== undefined) existing.name = dtoS['name'] as string;
    if (dtoS['description'] !== undefined)
      existing.description = (dtoS['description'] as string) ?? null;

    const saved = await this.services.save(existing);
    await this.bustCaches();
    return this.toServiceDto(saved);
  }

  async deleteService(
    placeId: string,
    serviceId: string,
  ): Promise<{ removed: boolean }> {
    const res = await this.services.delete({ id: serviceId, placeId });
    await this.bustCaches();
    return { removed: (res.affected ?? 0) > 0 };
  }

  /* ──────────────── internals ──────────────── */

  /** Same convenience used by listEvents — fewer lines at call sites. */
  private async listUpcomingEvents(
    placeId: string,
    limit: number,
  ): Promise<PlaceEventDto[]> {
    const rows = await this.events
      .createQueryBuilder('e')
      .where('e.placeId = :placeId', { placeId })
      .andWhere('e.isHidden = false')
      .andWhere('(e.endTime IS NULL OR e.endTime >= now())')
      .orderBy('e.startTime', 'ASC')
      .take(limit)
      .getMany();
    return rows.map((r: any) => this.toEventDto(r));
  }

  /**
   * Native catalog search — runs against the temples table directly so we
   * don't burn Google quota for users browsing by name/city. Used as a
   * fallback when no GOOGLE_PLACES_API_KEY is configured, or as a first
   * pass before falling out to Google for unknown names.
   */
  async searchNative(args: {
    q?: string;
    city?: string;
    type?: string;
    limit?: number;
  }): Promise<Array<{
    id: string; name: string; type: string;
    city?: string | null; state?: string | null;
    address?: string | null; imageUrl?: string | null;
    lat: number | null; lng: number | null;
    isVerified: boolean;
    ratingAvg?: string | null; ratingCount?: number | null;
  }>> {
    const qb = this.places
      .createQueryBuilder('t')
      .where('t.isHidden IS NULL OR t.isHidden = false');

    if (args.q && args.q.trim()) {
      const q = `%${args.q.trim()}%`;
      qb.andWhere('(t.name ILIKE :q OR t.city ILIKE :q OR t.address ILIKE :q)', { q });
    }
    if (args.city && args.city.trim()) {
      qb.andWhere('t.city ILIKE :city', { city: `%${args.city.trim()}%` });
    }
    if (args.type && args.type.trim()) {
      qb.andWhere('t.type = :type', { type: args.type.trim().toLowerCase() });
    }

    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const rows = await qb
      .orderBy('t.ratingCount', 'DESC', 'NULLS LAST')
      .addOrderBy('t.name', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      city: r.city ?? null,
      state: r.state ?? null,
      address: r.address ?? null,
      imageUrl: r.imageUrl ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      isVerified: !!r.isVerified,
      ratingAvg: r.ratingAvg ?? null,
      ratingCount: r.ratingCount ?? null,
    }));
  }

  /** Throws 404 if the place doesn't exist. */
  private async requirePlace(id: string): Promise<void> {
    const exists = await this.places
      .createQueryBuilder('t')
      .select('1')
      .where('t.id = :id', { id })
      .getRawOne();
    if (!exists) throw new NotFoundException('Place not found');
  }

  private validateEventWindow(startIso: string, endIso?: string | null): void {
    if (!endIso) return;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return;
    if (end <= start) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  /* ──────────────── mappers ──────────────── */

  private toPlaceDto(t: Temple): PlaceDto {
    return {
      id:              t.id,
      type:            (t.type ?? 'temple') as PlaceType,
      name:            t.name,
      city:            t.city,
      state:           t.state,
      address:         t.address,
      lat:             Number(t.lat),
      lng:             Number(t.lng),
      ratingAvg:       t.ratingAvg === null ? null : Number(t.ratingAvg),
      ratingCount:     t.ratingCount,
      openingHours:    t.hours,
      imageUrl:        t.imageUrl,
      galleryUrls:     t.galleryUrls ?? [],
      googlePlaceId:   t.googlePlaceId ?? null,
      description:     t.description ?? null,
      donationEnabled: t.donationEnabled ?? false,
      donationUpiId:   t.donationUpiId ?? null,
      ownerId:         t.ownerId ?? null,
      isVerified:      t.isVerified,
    };
  }

  /* ──────────────── gallery management ──────────────── */

  async addGalleryPhoto(placeId: string, imageUrl: string): Promise<string[]> {
    const place = await this.places.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');

    const gallery = place.galleryUrls ?? [];
    if (!gallery.includes(imageUrl)) {
      gallery.push(imageUrl);
      place.galleryUrls = gallery.slice(0, 20); // max 20 gallery photos
      // Also set cover if not already set
      if (!place.imageUrl) place.imageUrl = imageUrl;
      await this.places.save(place);
      await this.bustCaches();
    }
    return place.galleryUrls;
  }

  async removeGalleryPhoto(placeId: string, imageUrl: string): Promise<string[]> {
    const place = await this.places.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');

    place.galleryUrls = (place.galleryUrls ?? []).filter((u: any) => u !== imageUrl);
    if (place.imageUrl === imageUrl) {
      place.imageUrl = place.galleryUrls[0] ?? null;
    }
    await this.places.save(place);
    await this.bustCaches();
    return place.galleryUrls;
  }

  async setCoverPhoto(placeId: string, imageUrl: string): Promise<void> {
    const place = await this.places.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Place not found');

    place.imageUrl = imageUrl;
    if (!place.galleryUrls.includes(imageUrl)) {
      place.galleryUrls = [imageUrl, ...place.galleryUrls].slice(0, 20);
    }
    await this.places.save(place);
    await this.bustCaches();
  }

  private toEventDto(e: PlaceEvent): PlaceEventDto {
    return {
      id: e.id,
      placeId: e.placeId,
      title: e.title,
      description: e.description,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime ? e.endTime.toISOString() : null,
      recurring: e.recurring,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toServiceDto(s: PlaceServiceEntity): PlaceServiceDto {
    return {
      id: s.id,
      placeId: s.placeId,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
    };
  }
}

/* ──────────────── module-private helpers ──────────────── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
