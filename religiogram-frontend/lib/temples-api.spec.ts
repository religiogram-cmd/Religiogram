/**
 * Tests for lib/temples-api.ts
 *
 * temples-api uses fetch (not axios) and imports { tokenStore, ApiError } from './api'.
 * API_BASE resolves to '/api/v1' in jsdom (window.location.hostname === 'localhost').
 */

import { templesApi, TempleApiError } from './temples-api';
import { tokenStore } from './api';

function mockOk(data: unknown) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data })),
  });
}

function mockError(status: number, code = 'ERR', message = 'fail') {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error: { code, message } })),
  });
}

beforeEach(() => {
  globalThis.fetch = jest.fn();
  tokenStore.clear();
});

// ── TempleApiError ─────────────────────────────────────────────────────────────

describe('TempleApiError', () => {
  it('stores code, message, and status', () => {
    const e = new TempleApiError('NOT_FOUND', 'Temple not found', 404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Temple not found');
    expect(e.status).toBe(404);
    expect(e).toBeInstanceOf(Error);
  });
});

// ── templesApi.nearby ──────────────────────────────────────────────────────────

describe('templesApi.nearby', () => {
  it('calls GET /temples/nearby', async () => {
    mockOk([]);
    await templesApi.nearby({});
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/temples\/nearby/);
  });

  it('includes lat/lng query params', async () => {
    mockOk([]);
    await templesApi.nearby({ lat: 28.6, lng: 77.2 });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('lat=28.6');
    expect(url).toContain('lng=77.2');
  });

  it('includes city param when provided', async () => {
    mockOk([]);
    await templesApi.nearby({ city: 'delhi' });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('city=delhi');
  });

  it('injects Authorization when tokenStore has access token', async () => {
    tokenStore.set('test-tok', 'refresh-tok');
    mockOk([]);
    await templesApi.nearby({});
    const [, opts] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer test-tok');
  });

  it('returns data array on success', async () => {
    mockOk([{ id: 't1', name: 'Kashi Vishwanath' }]);
    const result = await templesApi.nearby({});
    expect(result).toHaveLength(1);
    expect((result as any[])[0].name).toBe('Kashi Vishwanath');
  });

  it('throws TempleApiError on error response', async () => {
    mockError(404, 'NOT_FOUND', 'no temples');
    await expect(templesApi.nearby({})).rejects.toBeInstanceOf(TempleApiError);
  });

  it('TempleApiError carries correct status and code', async () => {
    mockError(403, 'FORBIDDEN', 'access denied');
    try {
      await templesApi.nearby({});
    } catch (e: any) {
      expect(e.status).toBe(403);
      expect(e.code).toBe('FORBIDDEN');
    }
  });
});

// ── templesApi.list ────────────────────────────────────────────────────────────

describe('templesApi.list', () => {
  it('calls GET /temples', async () => {
    mockOk({ items: [], total: 0, page: 1, limit: 20, hasMore: false });
    await templesApi.list();
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/temples\?/);
  });

  it('includes search and city params', async () => {
    mockOk({ items: [], total: 0, page: 1, limit: 20, hasMore: false });
    await templesApi.list({ search: 'vishwanath', city: 'varanasi' });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('search=vishwanath');
    expect(url).toContain('city=varanasi');
  });

  it('includes page and limit when provided', async () => {
    mockOk({ items: [], total: 0, page: 2, limit: 10, hasMore: false });
    await templesApi.list({ page: 2, limit: 10 });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });
});

// ── templesApi.search ──────────────────────────────────────────────────────────

describe('templesApi.search', () => {
  it('calls GET /temples/search with q param', async () => {
    mockOk([]);
    await templesApi.search({ q: 'kashi' });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/temples\/search/);
    expect(url).toContain('q=kashi');
  });

  it('includes limit when provided', async () => {
    mockOk([]);
    await templesApi.search({ q: 'ram', limit: 5 });
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('limit=5');
  });
});

// ── templesApi.getById / get ───────────────────────────────────────────────────

describe('templesApi.getById', () => {
  it('calls GET /temples/:id', async () => {
    mockOk({ id: 'temple-1', name: 'Golden Temple' });
    await templesApi.getById('temple-1');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/temples\/temple-1$/);
  });

  it('templesApi.get is an alias for getById', async () => {
    mockOk({ id: 'temple-2' });
    await templesApi.get('temple-2');
    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/temples\/temple-2$/);
  });
});
