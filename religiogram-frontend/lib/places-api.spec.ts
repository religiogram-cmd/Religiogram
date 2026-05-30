/**
 * Tests for lib/places-api.ts
 *
 * Uses global fetch mock (globalThis.fetch = jest.fn()).
 * API_BASE resolves to 'https://api.religiogram.com/api/v1' in jest (no window.location.hostname=localhost, no NEXT_PUBLIC_API_BASE).
 */

import {
  PlacesApiError,
  placesTokenStore,
  formatRupees,
  googleMapsDirectionsUrl,
  starBreakdown,
  getPlaceDetail,
  getPlaceServices,
  getNearbyPlaces,
  listReviews,
  upsertReview,
} from './places-api';

// ── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchOk(data: unknown) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  });
}

function mockFetchRaw(body: unknown) {
  // envelope-less response (json IS the data)
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(status: number, message: string) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
  });
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  globalThis.fetch = jest.fn();
  placesTokenStore.set(null);
});

// ── PlacesApiError ─────────────────────────────────────────────────────────────

describe('PlacesApiError', () => {
  it('stores status and message', () => {
    const err = new PlacesApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('PlacesApiError');
  });

  it('is an instance of Error', () => {
    expect(new PlacesApiError(500, 'Oops')).toBeInstanceOf(Error);
  });
});

// ── placesTokenStore ───────────────────────────────────────────────────────────

describe('placesTokenStore', () => {
  it('returns null before any token is set', () => {
    expect(placesTokenStore.get()).toBeNull();
  });

  it('returns the token after set', () => {
    placesTokenStore.set('abc123');
    expect(placesTokenStore.get()).toBe('abc123');
  });

  it('can be cleared back to null', () => {
    placesTokenStore.set('tok');
    placesTokenStore.set(null);
    expect(placesTokenStore.get()).toBeNull();
  });
});

// ── formatRupees ───────────────────────────────────────────────────────────────

describe('formatRupees', () => {
  it('converts 0 paise to ₹0', () => {
    expect(formatRupees(0)).toBe('₹0');
  });

  it('converts 50000 paise to ₹500', () => {
    expect(formatRupees(50000)).toContain('500');
    expect(formatRupees(50000)).toMatch(/^₹/);
  });

  it('converts 100 paise to ₹1', () => {
    expect(formatRupees(100)).toContain('1');
    expect(formatRupees(100)).toMatch(/^₹/);
  });
});

// ── googleMapsDirectionsUrl ────────────────────────────────────────────────────

describe('googleMapsDirectionsUrl', () => {
  it('contains destination=lat,lng', () => {
    const url = googleMapsDirectionsUrl(28.6, 77.2);
    expect(url).toContain('destination=28.6,77.2');
  });

  it('starts with google maps dir URL', () => {
    const url = googleMapsDirectionsUrl(28.6, 77.2);
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir/);
  });

  it('uses destination_place_id=encoded label when provided', () => {
    const url = googleMapsDirectionsUrl(28.6, 77.2, 'Kashi Vishwanath');
    expect(url).toContain('destination_place_id=Kashi%20Vishwanath');
  });

  it('uses lat,lng as destination_place_id when no label', () => {
    const url = googleMapsDirectionsUrl(28.6, 77.2);
    expect(url).toContain('destination_place_id=28.6,77.2');
  });
});

// ── starBreakdown ──────────────────────────────────────────────────────────────

describe('starBreakdown', () => {
  it('returns 5 empty stars for null', () => {
    expect(starBreakdown(null)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('returns 5 full stars for 5.0', () => {
    expect(starBreakdown(5)).toEqual(['full', 'full', 'full', 'full', 'full']);
  });

  it('returns 4 full + 1 half for 4.5', () => {
    expect(starBreakdown(4.5)).toEqual(['full', 'full', 'full', 'full', 'half']);
  });

  it('returns 3 full + 2 empty for 3.0', () => {
    expect(starBreakdown(3.0)).toEqual(['full', 'full', 'full', 'empty', 'empty']);
  });

  it('returns array of length 5', () => {
    expect(starBreakdown(2.7)).toHaveLength(5);
  });
});

// ── getPlaceDetail ─────────────────────────────────────────────────────────────

describe('getPlaceDetail', () => {
  it('fetches /places/:id', async () => {
    mockFetchOk({ id: 'p1', name: 'Kashi Vishwanath' });
    const result = await getPlaceDetail('p1');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/places\/p1$/);
    expect((result as any).name).toBe('Kashi Vishwanath');
  });

  it('appends ?lat=&lng= when coords provided', async () => {
    mockFetchOk({ id: 'p2', name: 'Temple' });
    await getPlaceDetail('p2', { lat: 25.1, lng: 83.0 });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('lat=25.1');
    expect(url).toContain('lng=83');
  });

  it('injects Authorization header when token is set', async () => {
    placesTokenStore.set('tok-xyz');
    mockFetchOk({ id: 'p3' });
    await getPlaceDetail('p3');
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer tok-xyz');
  });

  it('throws PlacesApiError on non-ok response', async () => {
    mockFetchError(404, 'Place not found');
    await expect(getPlaceDetail('missing')).rejects.toBeInstanceOf(PlacesApiError);
  });

  it('PlacesApiError carries the correct status', async () => {
    mockFetchError(403, 'Forbidden');
    try {
      await getPlaceDetail('x');
    } catch (e: any) {
      expect(e.status).toBe(403);
    }
  });
});

// ── getPlaceServices ───────────────────────────────────────────────────────────

describe('getPlaceServices', () => {
  it('fetches /places/:id/services', async () => {
    mockFetchOk([]);
    await getPlaceServices('p1');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/places\/p1\/services$/);
  });
});

// ── getNearbyPlaces ────────────────────────────────────────────────────────────

describe('getNearbyPlaces', () => {
  it('fetches /places/:id/nearby', async () => {
    mockFetchOk([]);
    await getNearbyPlaces('p1');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/places\/p1\/nearby/);
  });

  it('appends radiusKm and limit when provided', async () => {
    mockFetchOk([]);
    await getNearbyPlaces('p1', { radiusKm: 5, limit: 10 });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('radiusKm=5');
    expect(url).toContain('limit=10');
  });
});

// ── listReviews ────────────────────────────────────────────────────────────────

describe('listReviews', () => {
  it('fetches /places/:id/reviews', async () => {
    mockFetchOk({ items: [], total: 0 });
    await listReviews('p1');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/places\/p1\/reviews/);
  });
});

// ── upsertReview ───────────────────────────────────────────────────────────────

describe('upsertReview', () => {
  it('POSTs to /places/:id/reviews', async () => {
    mockFetchOk({ id: 'r1', rating: 5 });
    await upsertReview('p1', { rating: 5, body: 'Jai Shree Ram' });
    const [url, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/places\/p1\/reviews/);
    expect(opts.method).toBe('POST');
  });

  it('sends rating and comment in body', async () => {
    mockFetchOk({ id: 'r2' });
    await upsertReview('p1', { rating: 4, body: 'Beautiful' });
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.rating).toBe(4);
    expect(body.body).toBe('Beautiful');
  });
});
