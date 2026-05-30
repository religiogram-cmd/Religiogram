/**
 * Places API client — full typed surface for holy places backend.
 *
 * Covers:
 *   - Place profile (detail, events, services, nearby)
 *   - Gallery (add/remove/cover — owner)
 *   - Reviews (list, upsert, delete, helpful)
 *   - Donations (create order, verify, stats, history)
 *   - Google Places (search, import)
 *
 * Pattern mirrors temples-api.ts: auth token injected from tokenStore,
 * uniform response envelope { success, data }, AbortSignal support.
 */

const DEFAULT_API_BASE = 'https://api.religiogram.com/api/v1';

const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/v1';
  }
  return DEFAULT_API_BASE;
})();

/* ── token store (same pattern as lib/api.ts) ─────────────────────── */
let _accessToken: string | null = null;
export const placesTokenStore = {
  get: () => _accessToken,
  set: (t: string | null) => { _accessToken = t; },
};

/* ── low-level fetch ─────────────────────────────────────────────── */
async function apiFetch<T>(
  path: string,
  opts: RequestInit & { signal?: AbortSignal } = {},
): Promise<T> {
  const token = _accessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  };

  // v9.1: cookie-mode CSRF — bespoke fetch must mirror central request()
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|; )rg_csrf=([^;]*)/);
    if (m && /^(POST|PUT|PATCH|DELETE)$/i.test(String(opts.method ?? 'GET'))) {
      (headers as any)['X-CSRF-Token'] = decodeURIComponent(m[1]);
    }
  }
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...opts, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new PlacesApiError(res.status, msg);
  }

  // Uniform envelope: { success: true, data: T }
  return ((json as any)?.data ?? json) as T;
}

export class PlacesApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

/* ════════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════════ */

export type PlaceType = 'temple' | 'mosque' | 'church' | 'gurudwara' | 'other';

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

export interface PlaceDetailDto extends PlaceDto {
  upcomingEvents: PlaceEventDto[];
  services: PlaceServiceDto[];
}

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
  ratingAvg: number | null;
  ratingCount: number;
  distribution: Record<1|2|3|4|5, number>;
}

export interface DonationStatsDto {
  totalDonations: number;
  totalAmountPaise: number;
  recentDonors: {
    name: string | null;
    amountPaise: number;
    message: string | null;
    donatedAt: string;
  }[];
}

export interface DonationOrderResponse {
  donationId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export interface MyDonationDto {
  id: string;
  placeId: string;
  placeName: string;
  amountPaise: number;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  message: string | null;
  isAnonymous: boolean;
  createdAt: string;
}

export interface GooglePlace {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingsTotal: number;
  openNow: boolean | null;
  photoUrls: string[];
  type: string;
  googleMapsUrl: string;
  phoneNumber: string | null;
  website: string | null;
  openingHoursText: string | null;
}

export interface GoogleSearchResult {
  places: GooglePlace[];
  nextPageToken: string | null;
}

/* ════════════════════════════════════════════════════════════════════
   PLACE PROFILE
   ════════════════════════════════════════════════════════════════════ */

export async function getPlaceDetail(
  id: string,
  coords?: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<PlaceDetailDto> {
  const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
  return apiFetch<PlaceDetailDto>(`/places/${id}${qs}`, { signal });
}

export async function getPlaceEvents(
  id: string,
  opts: { upcomingOnly?: boolean; limit?: number } = {},
  signal?: AbortSignal,
): Promise<PlaceEventDto[]> {
  const params = new URLSearchParams();
  if (opts.upcomingOnly === false) params.set('upcoming', '0');
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString().length ? `?${params}` : '';
  return apiFetch<PlaceEventDto[]>(`/places/${id}/events${qs}`, { signal });
}

export async function getPlaceServices(
  id: string,
  signal?: AbortSignal,
): Promise<PlaceServiceDto[]> {
  return apiFetch<PlaceServiceDto[]>(`/places/${id}/services`, { signal });
}

export async function getNearbyPlaces(
  id: string,
  opts: { lat?: number; lng?: number; radiusKm?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NearbyPlaceDto[]> {
  const params = new URLSearchParams();
  if (opts.lat !== undefined) params.set('lat', String(opts.lat));
  if (opts.lng !== undefined) params.set('lng', String(opts.lng));
  if (opts.radiusKm) params.set('radiusKm', String(opts.radiusKm));
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString().length ? `?${params}` : '';
  return apiFetch<NearbyPlaceDto[]>(`/places/${id}/nearby${qs}`, { signal });
}

/* ════════════════════════════════════════════════════════════════════
   GALLERY (owner / admin)
   ════════════════════════════════════════════════════════════════════ */

export async function addGalleryPhoto(id: string, imageUrl: string): Promise<string[]> {
  return apiFetch<string[]>(`/places/${id}/gallery`, {
    method: 'POST',
    body: JSON.stringify({ imageUrl }),
  });
}

export async function removeGalleryPhoto(id: string, imageUrl: string): Promise<string[]> {
  return apiFetch<string[]>(`/places/${id}/gallery`, {
    method: 'DELETE',
    body: JSON.stringify({ imageUrl }),
  });
}

export async function setCoverPhoto(id: string, imageUrl: string): Promise<void> {
  return apiFetch<void>(`/places/${id}/gallery/cover`, {
    method: 'PUT',
    body: JSON.stringify({ imageUrl }),
  });
}

/* ════════════════════════════════════════════════════════════════════
   REVIEWS
   ════════════════════════════════════════════════════════════════════ */

export async function listReviews(
  id: string,
  opts: { page?: number; limit?: number; sort?: 'newest' | 'highest' | 'helpful' } = {},
  signal?: AbortSignal,
): Promise<ReviewsPageDto> {
  const params = new URLSearchParams();
  if (opts.page)  params.set('page',  String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.sort)  params.set('sort',  opts.sort);
  const qs = params.toString().length ? `?${params}` : '';
  return apiFetch<ReviewsPageDto>(`/places/${id}/reviews${qs}`, { signal });
}

export async function getMyReview(id: string): Promise<ReviewDto | null> {
  try {
    return await apiFetch<ReviewDto>(`/places/${id}/reviews/mine`);
  } catch (e) {
    if (e instanceof PlacesApiError && e.status === 404) return null;
    throw e;
  }
}

export async function upsertReview(
  id: string,
  dto: { rating: number; body?: string; visitDate?: string; photoUrls?: string[] },
): Promise<ReviewDto> {
  return apiFetch<ReviewDto>(`/places/${id}/reviews`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteMyReview(id: string): Promise<{ removed: boolean }> {
  return apiFetch<{ removed: boolean }>(`/places/${id}/reviews/mine`, { method: 'DELETE' });
}

export async function markReviewHelpful(id: string, reviewId: string): Promise<{ helpfulCount: number }> {
  return apiFetch<{ helpfulCount: number }>(`/places/${id}/reviews/${reviewId}/helpful`, { method: 'POST' });
}

/* ════════════════════════════════════════════════════════════════════
   DONATIONS
   ════════════════════════════════════════════════════════════════════ */

export async function getDonationStats(id: string, signal?: AbortSignal): Promise<DonationStatsDto> {
  return apiFetch<DonationStatsDto>(`/places/${id}/donations/stats`, { signal });
}

export async function createDonationOrder(
  id: string,
  dto: { amountPaise: number; message?: string; isAnonymous?: boolean },
): Promise<DonationOrderResponse> {
  return apiFetch<DonationOrderResponse>(`/places/${id}/donations/order`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function verifyDonation(dto: {
  donationId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}, placeId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/places/${placeId}/donations/verify`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getMyDonations(id: string): Promise<MyDonationDto[]> {
  return apiFetch<MyDonationDto[]>(`/places/${id}/donations/mine`);
}

export async function getAllMyDonations(): Promise<MyDonationDto[]> {
  return apiFetch<MyDonationDto[]>('/places/donations/all-mine');
}

/* ════════════════════════════════════════════════════════════════════
   GOOGLE PLACES
   ════════════════════════════════════════════════════════════════════ */

export async function searchGooglePlaces(
  opts: { q?: string; lat?: number; lng?: number; religion?: string; radius?: number },
  signal?: AbortSignal,
): Promise<GoogleSearchResult> {
  const params = new URLSearchParams();
  if (opts.q)       params.set('q', opts.q);
  if (opts.lat !== undefined) params.set('lat', String(opts.lat));
  if (opts.lng !== undefined) params.set('lng', String(opts.lng));
  if (opts.religion) params.set('religion', opts.religion);
  if (opts.radius)   params.set('radius', String(opts.radius));
  return apiFetch<GoogleSearchResult>(`/places/search/google?${params}`, { signal });
}

export async function importGooglePlace(googlePlaceId: string): Promise<PlaceDto> {
  return apiFetch<PlaceDto>('/places/google/import', {
    method: 'POST',
    body: JSON.stringify({ googlePlaceId }),
  });
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════ */

/** Format paise to a human-readable rupee string: 50000 → "₹500" */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

/** Google Maps deep-link for Get Directions */
export function googleMapsDirectionsUrl(lat: number, lng: number, label?: string): string {
  const dest = `${lat},${lng}`;
  const q = label ? encodeURIComponent(label) : dest;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&destination_place_id=${q}`;
}

/** Star rating display helper: returns array of 'full' | 'half' | 'empty' */
export function starBreakdown(avg: number | null): ('full' | 'half' | 'empty')[] {
  if (avg === null) return Array(5).fill('empty');
  return Array.from({ length: 5 }, (_, i) => {
    const diff = avg - i;
    if (diff >= 1) return 'full';
    if (diff >= 0.5) return 'half';
    return 'empty';
  });
}
