/**
 * Tests for lib/analytics.ts
 *
 * We mock:
 *   - global.fetch  (to intercept the beacon POST)
 *   - lib/api       (tokenStore.access + ApiError)
 *
 * analytics.ts is fire-and-forget, so tests that fire a beacon must call
 * `await flushPromises()` to let the promise chain settle before asserting
 * on `fetch`.
 */

// ── helpers ───────────────────────────────────────────────────────────────────

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

// ── mocks ─────────────────────────────────────────────────────────────────────

// Mock the api module so tokenStore is injectable per test.
const mockTokenStore = { access: null as string | null };

class MockApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

jest.mock('./api', () => ({
  tokenStore: mockTokenStore,
  ApiError: MockApiError,
}));

// ── import under test (after mocks are set up) ────────────────────────────────

import { track, analytics } from './analytics';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('track()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockTokenStore.access = null;
    if (!global.fetch) (global as any).fetch = jest.fn();
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('does not call fetch when window is undefined (server-side guard)', async () => {
    // Simulate SSR: remove window
    const win = (global as any).window;
    delete (global as any).window;

    track({ eventType: 'search_query' });
    await flushPromises();

    expect(fetchSpy).not.toHaveBeenCalled();

    // Restore
    (global as any).window = win;
  });

  it('calls fetch once with method POST', async () => {
    track({ eventType: 'temple_click' });
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('POST');
  });

  it('targets the analytics/event endpoint', async () => {
    track({ eventType: 'city_selected' });
    await flushPromises();

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/analytics/event');
  });

  it('sends Content-Type application/json header', async () => {
    track({ eventType: 'tab_switch' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('does NOT include Authorization header when access token is null', async () => {
    mockTokenStore.access = null;
    track({ eventType: 'tab_switch' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('includes Authorization header when access token is set', async () => {
    mockTokenStore.access = 'my-access-token';
    track({ eventType: 'tab_switch' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer my-access-token');
  });

  it('includes keepalive: true on the fetch request', async () => {
    track({ eventType: 'nearby_viewed' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.keepalive).toBe(true);
  });

  it('serialises the correct eventType in the body', async () => {
    track({ eventType: 'favorite_toggle', metadata: { templeId: 't-1', favorited: true } });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.eventType).toBe('favorite_toggle');
    expect(body.metadata.templeId).toBe('t-1');
    expect(body.metadata.favorited).toBe(true);
  });

  it('includes a clientTs ISO timestamp in the body', async () => {
    track({ eventType: 'search_query' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(typeof body.clientTs).toBe('string');
    expect(new Date(body.clientTs).toString()).not.toBe('Invalid Date');
  });

  it('defaults metadata to {} when not provided', async () => {
    track({ eventType: 'report_submitted' });
    await flushPromises();

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.metadata).toEqual({});
  });

  it('does not throw even when fetch rejects (fire-and-forget)', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    expect(() => track({ eventType: 'search_query' })).not.toThrow();
    await flushPromises();
    // No assertion needed — test passes if no uncaught rejection
  });

  it('does not throw even when fetch returns a 500', async () => {
    fetchSpy.mockResolvedValue(new Response('error', { status: 500 }));
    expect(() => track({ eventType: 'search_query' })).not.toThrow();
    await flushPromises();
  });
});

// ── convenience wrappers ──────────────────────────────────────────────────────

describe('analytics convenience wrappers', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockTokenStore.access = null;
    if (!global.fetch) (global as any).fetch = jest.fn();
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  async function capturedBody(): Promise<Record<string, unknown>> {
    await flushPromises();
    const [, init] = fetchSpy.mock.calls[0];
    return JSON.parse(init.body);
  }

  it('analytics.searchQuery → eventType=search_query', async () => {
    analytics.searchQuery('temple near me', 'manual');
    const body = await capturedBody();
    expect(body.eventType).toBe('search_query');
    expect((body.metadata as any).q).toBe('temple near me');
    expect((body.metadata as any).source).toBe('manual');
  });

  it('analytics.searchQuery truncates query to 120 chars', async () => {
    analytics.searchQuery('a'.repeat(200), 'manual');
    const body = await capturedBody();
    expect((body.metadata as any).q).toHaveLength(120);
  });

  it('analytics.templeClick → eventType=temple_click', async () => {
    analytics.templeClick('t-123', 'map');
    const body = await capturedBody();
    expect(body.eventType).toBe('temple_click');
    expect((body.metadata as any).templeId).toBe('t-123');
    expect((body.metadata as any).source).toBe('map');
  });

  it('analytics.citySelected → eventType=city_selected', async () => {
    analytics.citySelected('delhi', 'modal');
    const body = await capturedBody();
    expect(body.eventType).toBe('city_selected');
    expect((body.metadata as any).citySlug).toBe('delhi');
  });

  it('analytics.tabSwitch → eventType=tab_switch', async () => {
    analytics.tabSwitch('all');
    const body = await capturedBody();
    expect(body.eventType).toBe('tab_switch');
    expect((body.metadata as any).to).toBe('all');
  });

  it('analytics.locationPermission → eventType=location_permission', async () => {
    analytics.locationPermission('denied');
    const body = await capturedBody();
    expect(body.eventType).toBe('location_permission');
    expect((body.metadata as any).result).toBe('denied');
  });

  it('analytics.favoriteToggle → eventType=favorite_toggle', async () => {
    analytics.favoriteToggle('t-1', true, 'card');
    const body = await capturedBody();
    expect(body.eventType).toBe('favorite_toggle');
    expect((body.metadata as any).favorited).toBe(true);
  });

  it('analytics.nearbyViewed → eventType=nearby_viewed', async () => {
    analytics.nearbyViewed('t-1', 5);
    const body = await capturedBody();
    expect(body.eventType).toBe('nearby_viewed');
    expect((body.metadata as any).count).toBe(5);
  });

  it('analytics.nearbyClicked → eventType=nearby_clicked', async () => {
    analytics.nearbyClicked('t-1', 't-2', 0);
    const body = await capturedBody();
    expect(body.eventType).toBe('nearby_clicked');
    expect((body.metadata as any).nearbyPlaceId).toBe('t-2');
    expect((body.metadata as any).index).toBe(0);
  });
});
