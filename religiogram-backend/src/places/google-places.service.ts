import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import axios, { AxiosError } from 'axios';
import { Temple } from '../temples/entities/temple.entity';

/* ── Google Places API types (v1 — "new" Places API) ─────────────────── */

export interface GooglePlace {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingsTotal: number;
  openNow: boolean | null;
  photoUrls: string[];   // resolved CDN URLs via our proxy
  type: string;          // mapped to our PlaceType
  googleMapsUrl: string;
  phoneNumber: string | null;
  website: string | null;
  openingHoursText: string | null;
}

export interface GoogleSearchResult {
  places: GooglePlace[];
  nextPageToken: string | null;
}

/** Religion → Google place types used in the Nearby Search */
const RELIGION_TO_GOOGLE_TYPES: Record<string, string[]> = {
  hindu:     ['hindu_temple'],
  muslim:    ['mosque'],
  christian: ['church'],
  sikh:      ['place_of_worship'],
  all:       ['hindu_temple', 'mosque', 'church', 'place_of_worship'],
};

/** Google place type → our internal type discriminator */
const GOOGLE_TYPE_MAP: Record<string, string> = {
  hindu_temple:       'temple',
  mosque:             'mosque',
  church:             'church',
  place_of_worship:   'other',
  synagogue:          'other',
  buddhist_temple:    'other',
};

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api';
const PLACES_PHOTO_BASE = 'https://maps.googleapis.com/maps/api/place/photo';
const MAX_GALLERY_PHOTOS = 6;
const PHOTO_MAX_WIDTH = 1200; // HD

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);

  constructor(
    @InjectRepository(Temple)
    private readonly templeRepo: Repository<Temple>,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get apiKey(): string {
    return this.config.get<string>('google.placesApiKey') ?? '';
  }

  private get hasApiKey(): boolean {
    return this.apiKey.length > 10;
  }

  /* ── Public: search Google Places near a location ───────────────── */

  async searchNearby(opts: {
    lat: number;
    lng: number;
    radius?: number;     // metres, default 5000
    religion?: string;
    keyword?: string;
    pageToken?: string;
  }): Promise<GoogleSearchResult> {
    if (!this.hasApiKey) return { places: [], nextPageToken: null };

    const types = RELIGION_TO_GOOGLE_TYPES[opts.religion ?? 'all'] ?? ['place_of_worship'];
    const radius = Math.min(opts.radius ?? 5000, 50000);

    const nearbyCacheKey = `gplaces:nearby:${opts.lat}:${opts.lng}:${radius}:${opts.religion ?? 'all'}:${opts.keyword ?? ''}`;
    try {
      const cachedNearby = await this.redis.getClient().get(nearbyCacheKey);
      if (cachedNearby) return JSON.parse(cachedNearby) as GoogleSearchResult;
    } catch { /* cache miss — continue */ }

    try {
      const { data } = await axios.get<any>(
        `${PLACES_API_BASE}/place/nearbysearch/json`,
        {
          params: {
            location: `${opts.lat},${opts.lng}`,
            radius,
            type: types[0],
            keyword: opts.keyword,
            pagetoken: opts.pageToken,
            key: this.apiKey,
          },
        },
      );

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Google Places nearbySearch: ${data.status}`);
        return { places: [], nextPageToken: null };
      }

      const places: GooglePlace[] = (data.results ?? []).map((r: any) =>
        this.mapGoogleResult(r),
      );

      const nearbyResult: GoogleSearchResult = { places, nextPageToken: data.next_page_token ?? null };
      await this.redis.getClient().setex(nearbyCacheKey, 300, JSON.stringify(nearbyResult)).catch(() => {});
      return nearbyResult;
    } catch (err) {
      this.logger.error(
        `Google Places nearbySearch failed: ${(err as AxiosError).message}`,
      );
      return { places: [], nextPageToken: null };
    }
  }

  /* ── Public: text search ─────────────────────────────────────────── */

  async textSearch(query: string, lat?: number, lng?: number): Promise<GoogleSearchResult> {
    if (!this.hasApiKey) return { places: [], nextPageToken: null };

    try {
      const { data } = await axios.get<any>(
        `${PLACES_API_BASE}/place/textsearch/json`,
        {
          params: {
            query,
            type: 'place_of_worship',
            location: lat !== undefined && lng !== undefined ? `${lat},${lng}` : undefined,
            radius: lat !== undefined ? 50000 : undefined,
            key: this.apiKey,
          },
        },
      );

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        return { places: [], nextPageToken: null };
      }

      return {
        places: (data.results ?? []).map((r: any) => this.mapGoogleResult(r)),
        nextPageToken: data.next_page_token ?? null,
      };
    } catch (err) {
      this.logger.error(`Google Places textSearch failed: ${(err as AxiosError).message}`);
      return { places: [], nextPageToken: null };
    }
  }

  /* ── Public: get full details for a single Google place ──────────── */

  async getDetails(googlePlaceId: string): Promise<GooglePlace | null> {
    if (!this.hasApiKey) return null;

    const detailCacheKey = `gplaces:detail:${googlePlaceId}`;
    try {
      const cachedDetail = await this.redis.getClient().get(detailCacheKey);
      if (cachedDetail) return JSON.parse(cachedDetail) as GooglePlace;
    } catch { /* cache miss — continue */ }

    try {
      const { data } = await axios.get<any>(
        `${PLACES_API_BASE}/place/details/json`,
        {
          params: {
            place_id: googlePlaceId,
            fields: [
              'place_id', 'name', 'formatted_address', 'geometry',
              'rating', 'user_ratings_total', 'opening_hours',
              'photos', 'types', 'url', 'formatted_phone_number',
              'website', 'international_phone_number',
            ].join(','),
            key: this.apiKey,
          },
        },
      );

      if (data.status !== 'OK' || !data.result) return null;
      const detailResult = this.mapGoogleResult(data.result);
      await this.redis.getClient().setex(detailCacheKey, 3600, JSON.stringify(detailResult)).catch(() => {});
      return detailResult;
    } catch (err) {
      this.logger.error(`Google Places getDetails failed: ${(err as AxiosError).message}`);
      return null;
    }
  }

  /* ── Public: import / sync a Google Place into the temples table ─── */

  /**
   * Upserts a temple row from a Google Places result.
   * - If a row with `google_place_id = googlePlaceId` already exists → update.
   * - Otherwise → insert.
   *
   * @returns the saved Temple row.
   */
  async importPlace(googlePlaceId: string): Promise<Temple> {
    if (!this.hasApiKey) {
      throw new BadRequestException('Google Places API key not configured');
    }

    const details = await this.getDetails(googlePlaceId);
    if (!details) {
      throw new NotFoundException(`Google place ${googlePlaceId} not found`);
    }

    // Check if we already have this place
    let row = await this.templeRepo.findOne({
      where: { googlePlaceId },
    });

    const addressParts = details.address?.split(',') ?? [];
    const city = addressParts.length >= 2
      ? addressParts[addressParts.length - 2].trim()
      : 'Unknown';
    const state = addressParts.length >= 1
      ? addressParts[addressParts.length - 1].trim().replace(/\s\d{6}/, '').trim()
      : null;

    if (!row) {
      row = this.templeRepo.create();
    }

    row.name          = details.name;
    row.address       = details.address;
    row.city          = city;
    row.state         = state;
    row.lat           = details.lat;
    row.lng           = details.lng;
    row.type          = details.type;
    row.googlePlaceId = googlePlaceId;
    row.hours         = details.openingHoursText?.slice(0, 120) ?? null;

    if (details.rating !== null) {
      row.ratingAvg   = String(details.rating);
      row.ratingCount = details.userRatingsTotal;
    }

    if (details.photoUrls.length > 0 && !row.imageUrl) {
      row.imageUrl = details.photoUrls[0];
    }
    if (details.photoUrls.length > 0) {
      row.galleryUrls = details.photoUrls.slice(0, MAX_GALLERY_PHOTOS);
    }

    const saved = await this.templeRepo.save(row);

    // Sync the PostGIS geography column (can't do it via the ORM easily)
    await this.templeRepo.query(
      `UPDATE temples SET location = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id = $3`,
      [details.lng, details.lat, saved.id],
    );

    this.logger.log(`Imported Google place ${googlePlaceId} → temple ${saved.id}`);
    return saved;
  }

  /* ── Public: resolve a Google Places photo reference to a URL ──── */

  /**
   * Returns a signed Google Places photo URL.
   * This is the URL the frontend displays; it doesn't stream the photo
   * through our server (bandwidth + latency).
   */
  resolvePhotoUrl(photoReference: string, _maxWidth = PHOTO_MAX_WIDTH): string {
    if (!photoReference) return '';
    // S4: Never embed the server API key in URLs returned to clients.
    // Return a server-side proxy path instead — the backend /v1/places/photo
    // endpoint streams the image after adding the key server-side.
    return `/v1/places/photo?ref=${encodeURIComponent(photoReference)}`;
  }

  /* ── Private: shape mapper ───────────────────────────────────────── */

  private mapGoogleResult(r: any): GooglePlace {
    const loc = r.geometry?.location ?? {};
    const lat = Number(loc.lat ?? 0);
    const lng = Number(loc.lng ?? 0);

    const photos: string[] = (r.photos ?? [])
      .slice(0, MAX_GALLERY_PHOTOS)
      .map((p: any) =>
        this.resolvePhotoUrl(p.photo_reference ?? '', PHOTO_MAX_WIDTH),
      );

    // Determine our internal type from Google's types array
    const gTypes: string[] = r.types ?? [];
    const mappedType =
      gTypes.map((t: string) => GOOGLE_TYPE_MAP[t]).find(Boolean) ?? 'other';

    const openingHoursText: string | null =
      r.opening_hours?.weekday_text?.join(' | ') ?? null;

    return {
      placeId:           r.place_id ?? '',
      name:              r.name ?? '',
      address:           r.formatted_address ?? r.vicinity ?? null,
      lat,
      lng,
      rating:            r.rating != null ? Number(r.rating) : null,
      userRatingsTotal:  Number(r.user_ratings_total ?? 0),
      openNow:           r.opening_hours?.open_now ?? null,
      photoUrls:         photos,
      type:              mappedType,
      googleMapsUrl:     r.url ?? `https://maps.google.com/?q=${lat},${lng}`,
      phoneNumber:       r.formatted_phone_number ?? r.international_phone_number ?? null,
      website:           r.website ?? null,
      openingHoursText,
    };
  }
}
