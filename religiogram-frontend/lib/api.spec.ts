/**
 * Tests for lib/api.ts
 *
 * Covers:
 *   - tokenStore (get/set/clear, in-memory + localStorage)
 *   - ApiError (shape, inheritance)
 *   - tryRefresh (single-flight, success path, failure paths)
 *   - authApi, usersApi, profileApi, favoritesApi, placesApi (lib/api),
 *     claimApi, remindersApi, reportsApi, providersApi, followsApi
 */

// ── helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── tokenStore ────────────────────────────────────────────────────────────────

import {
  tokenStore, ApiError, tryRefresh,
  authApi, usersApi, profileApi, favoritesApi,
  placesApi, claimApi, remindersApi, reportsApi,
  providersApi, followsApi,
} from './api';

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clear();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('access is null', () => {
      expect(tokenStore.access).toBeNull();
    });

    it('refresh is null when localStorage is empty', () => {
      expect(tokenStore.refresh).toBeNull();
    });
  });

  describe('set()', () => {
    it('stores the access token in memory', () => {
      tokenStore.set('acc-1', 'ref-1');
      expect(tokenStore.access).toBe('acc-1');
    });

    it('stores the refresh token in localStorage', () => {
      tokenStore.set('acc-1', 'ref-1');
      expect(localStorage.getItem('rg_refresh')).toBe('ref-1');
    });

    it('refresh getter reads the stored refresh token', () => {
      tokenStore.set('acc-1', 'ref-abc');
      expect(tokenStore.refresh).toBe('ref-abc');
    });

    it('overwrites existing tokens on a second call', () => {
      tokenStore.set('old-acc', 'old-ref');
      tokenStore.set('new-acc', 'new-ref');
      expect(tokenStore.access).toBe('new-acc');
      expect(tokenStore.refresh).toBe('new-ref');
    });
  });

  describe('clear()', () => {
    it('sets access to null', () => {
      tokenStore.set('acc', 'ref');
      tokenStore.clear();
      expect(tokenStore.access).toBeNull();
    });

    it('removes refresh token from localStorage', () => {
      tokenStore.set('acc', 'ref');
      tokenStore.clear();
      expect(localStorage.getItem('rg_refresh')).toBeNull();
    });

    it('refresh getter returns null after clear', () => {
      tokenStore.set('acc', 'ref');
      tokenStore.clear();
      expect(tokenStore.refresh).toBeNull();
    });

    it('is safe to call when already empty', () => {
      expect(() => tokenStore.clear()).not.toThrow();
    });
  });
});

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError('NOT_FOUND', 'Resource not found', 404);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "ApiError"', () => {
    const err = new ApiError('NOT_FOUND', 'Not found', 404);
    expect(err.name).toBe('ApiError');
  });

  it('sets message correctly', () => {
    const err = new ApiError('ERR', 'something went wrong', 500);
    expect(err.message).toBe('something went wrong');
  });

  it('sets code correctly', () => {
    const err = new ApiError('TOKEN_EXPIRED', 'Token expired', 401);
    expect(err.code).toBe('TOKEN_EXPIRED');
  });

  it('sets status correctly', () => {
    const err = new ApiError('FORBIDDEN', 'Access denied', 403);
    expect(err.status).toBe(403);
  });

  it('sets retryAfter when provided', () => {
    const err = new ApiError('RATE_LIMITED', 'Too many requests', 429, 30);
    expect(err.retryAfter).toBe(30);
  });

  it('retryAfter is undefined when not provided', () => {
    const err = new ApiError('ERR', 'msg', 500);
    expect(err.retryAfter).toBeUndefined();
  });

  it('can be caught as an Error', () => {
    expect(() => { throw new ApiError('TEST', 'test error', 400); }).toThrow(Error);
  });

  it('can be caught as an ApiError specifically', () => {
    expect(() => { throw new ApiError('TEST', 'test error', 400); }).toThrow(ApiError);
  });
});

// ── tryRefresh() ──────────────────────────────────────────────────────────────

describe('tryRefresh()', () => {
  let mockFetch: jest.Mock;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    tokenStore.clear();
    localStorage.clear();
    originalFetch = (global as any).fetch;
    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('returns false and clears tokens when no refresh token is available', async () => {
    const result = await tryRefresh();
    expect(result).toBe(false);
    expect(tokenStore.access).toBeNull();
  });

  it('returns true and updates tokens on a successful refresh', async () => {
    tokenStore.set('old-acc', 'old-ref');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { tokens: { accessToken: 'new-acc', refreshToken: 'new-ref' } } }),
    );
    const result = await tryRefresh();
    expect(result).toBe(true);
    expect(tokenStore.access).toBe('new-acc');
    expect(tokenStore.refresh).toBe('new-ref');
  });

  it('returns false and clears tokens when the refresh endpoint returns non-OK', async () => {
    tokenStore.set('acc', 'old-ref');
    mockFetch.mockResolvedValueOnce(new Response('', { status: 401 }));
    const result = await tryRefresh();
    expect(result).toBe(false);
    expect(tokenStore.access).toBeNull();
  });

  it('returns false and clears tokens when the refresh response body is malformed', async () => {
    tokenStore.set('acc', 'old-ref');
    mockFetch.mockResolvedValueOnce(new Response('{bad json}', { status: 200 }));
    const result = await tryRefresh();
    expect(result).toBe(false);
    expect(tokenStore.access).toBeNull();
  });

  it('returns false and clears tokens when tokens are missing from the response payload', async () => {
    tokenStore.set('acc', 'old-ref');
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    const result = await tryRefresh();
    expect(result).toBe(false);
    expect(tokenStore.access).toBeNull();
  });

  it('returns false and clears tokens when fetch itself throws (network error)', async () => {
    tokenStore.set('acc', 'old-ref');
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const result = await tryRefresh();
    expect(result).toBe(false);
    expect(tokenStore.access).toBeNull();
  });

  it('reuses the in-flight promise for concurrent callers (single-flight)', async () => {
    tokenStore.set('acc', 'old-ref');
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    mockFetch.mockReturnValueOnce(pendingFetch);

    const p1 = tryRefresh();
    const p2 = tryRefresh();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch(
      jsonResponse({ data: { tokens: { accessToken: 'fresh-acc', refreshToken: 'fresh-ref' } } }),
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── Shared fetch mock setup for API object tests ──────────────────────────────

let mockFetch: jest.Mock;
let savedFetch: typeof fetch;

beforeAll(() => {
  savedFetch = (global as any).fetch;
  mockFetch = jest.fn();
  (global as any).fetch = mockFetch;
});

afterAll(() => {
  (global as any).fetch = savedFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
  tokenStore.clear();
  localStorage.clear();
});

// ── authApi ───────────────────────────────────────────────────────────────────

describe('authApi', () => {
  it('sendOtp — POSTs to /auth/send-otp with phone', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { message: 'sent', expiresIn: 300, resendAfter: 60 } }),
    );
    const res = await authApi.sendOtp('+919999999999');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/send-otp');
    expect(init.method).toBe('POST');
    expect(res.message).toBe('sent');
  });

  it('verifyOtp — POSTs to /auth/verify-otp and returns AuthResponse', async () => {
    const authData = { tokens: { accessToken: 'a', refreshToken: 'r' }, user: { id: 'u1', phone: '+91' } };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: authData }));
    const res = await authApi.verifyOtp('+91', '123456');
    expect(mockFetch.mock.calls[0][0]).toContain('/auth/verify-otp');
    expect(res).toEqual(authData);
  });

  it('refresh — POSTs to /auth/refresh with refreshToken body', async () => {
    tokenStore.set('old', 'my-refresh');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { tokens: { accessToken: 'new', refreshToken: 'new-r' }, user: {} } }),
    );
    await authApi.refresh();
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.refreshToken).toBe('my-refresh');
  });

  it('logout — clears tokenStore regardless of server response', async () => {
    tokenStore.set('acc', 'ref');
    mockFetch.mockResolvedValueOnce(new Response('', { status: 204 }));
    await authApi.logout();
    expect(tokenStore.access).toBeNull();
  });

  it('logout — still clears tokens when server returns 500', async () => {
    tokenStore.set('acc', 'ref');
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    await authApi.logout();
    expect(tokenStore.access).toBeNull();
  });

  it('googleUrl — returns a URL string containing /auth/google', () => {
    expect(authApi.googleUrl()).toContain('/auth/google');
  });

  it('devLogin — POSTs to /auth/dev-login', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { tokens: { accessToken: 'a', refreshToken: 'r' }, user: {} } }),
    );
    await authApi.devLogin('admin@rg.com', 'pass');
    expect(mockFetch.mock.calls[0][0]).toContain('/auth/dev-login');
  });

  it('register — POSTs to /auth/register', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { tokens: { accessToken: 'a', refreshToken: 'r' }, user: {} } }),
    );
    await authApi.register('user@rg.com', 'Password1!');
    expect(mockFetch.mock.calls[0][0]).toContain('/auth/register');
  });

  it('emailLogin — POSTs to /auth/login', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { tokens: { accessToken: 'a', refreshToken: 'r' }, user: {} } }),
    );
    await authApi.emailLogin('user@rg.com', 'Password1!');
    expect(mockFetch.mock.calls[0][0]).toContain('/auth/login');
  });
});

// ── usersApi ──────────────────────────────────────────────────────────────────

describe('usersApi', () => {
  it('me — GETs /users/me', async () => {
    const user = { id: 'u1', name: 'Arjun', phone: '+91', createdAt: '2024-01-01T00:00:00Z' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: user }));
    tokenStore.set('tok', 'ref');
    const res = await usersApi.me();
    expect(mockFetch.mock.calls[0][0]).toContain('/users/me');
    expect(res.id).toBe('u1');
  });

  it('updateProfile — PATCHes /users/me', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { id: 'u1', name: 'New Name', email: null, avatarUrl: null } }),
    );
    tokenStore.set('tok', 'ref');
    const res = await usersApi.updateProfile({ name: 'New Name' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me');
    expect(init.method).toBe('PATCH');
    expect(res.name).toBe('New Name');
  });
});

// ── profileApi ────────────────────────────────────────────────────────────────

describe('profileApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('get — GETs /profile', async () => {
    const profile = { userId: 'u1', step: 2, data: {}, completed: false, updatedAt: '' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: profile }));
    const res = await profileApi.get();
    expect(mockFetch.mock.calls[0][0]).toContain('/profile');
    expect(res.step).toBe(2);
  });

  it('create — POSTs to /profile', async () => {
    const profile = { userId: 'u1', step: 0, data: {}, completed: false, updatedAt: '' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: profile }));
    await profileApi.create({ step: 0 });
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('update — PATCHes /profile', async () => {
    const profile = { userId: 'u1', step: 1, data: { name: 'X' }, completed: false, updatedAt: '' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: profile }));
    await profileApi.update({ step: 1, data: { name: 'X' } });
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
  });
});

// ── favoritesApi ──────────────────────────────────────────────────────────────

describe('favoritesApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('list — GETs /users/me/favourites', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const res = await favoritesApi.list();
    expect(mockFetch.mock.calls[0][0]).toContain('/users/me/favourites');
    expect(res).toEqual([]);
  });

  it('ids — POSTs /users/me/favourites/check with ids array', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ids: ['t-1'] } }));
    const res = await favoritesApi.ids(['t-1', 't-2']);
    expect(mockFetch.mock.calls[0][0]).toContain('/favourites/check');
    expect(res.ids).toContain('t-1');
  });

  it('add — POSTs to /users/me/favourites/:id', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 204 }));
    await favoritesApi.add('temple-99');
    expect(mockFetch.mock.calls[0][0]).toContain('/favourites/temple-99');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('remove — DELETEs /users/me/favourites/:id', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 204 }));
    await favoritesApi.remove('temple-99');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});

// ── placesApi (lib/api version) ───────────────────────────────────────────────

describe('placesApi (lib/api)', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('nearby — GETs /places/nearby with lat/lng params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await placesApi.nearby({ lat: 12.97, lng: 77.59 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/places/nearby');
    expect(url).toContain('lat=12.97');
    expect(url).toContain('lng=77.59');
  });

  it('nearby — accepts city string shorthand', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await placesApi.nearby('Bengaluru');
    expect(mockFetch.mock.calls[0][0]).toContain('city=Bengaluru');
  });

  it('getById — GETs /places/:id', async () => {
    const place = { id: 'p1', name: 'Shiva Temple' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: place }));
    const res = await placesApi.getById('p1');
    expect(mockFetch.mock.calls[0][0]).toContain('/places/p1');
    expect(res.name).toBe('Shiva Temple');
  });

  it('get — is an alias for getById', async () => {
    const place = { id: 'p2', name: 'Mosque' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: place }));
    const res = await placesApi.get('p2');
    expect(res.name).toBe('Mosque');
  });
});

// ── claimApi ──────────────────────────────────────────────────────────────────

describe('claimApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('submit(string, body) — POSTs to /places/:id/claim', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await claimApi.submit('place-1', { contactName: 'Arjun', contactEmail: 'a@b.com' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/places/place-1/claim');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('submit(dto) — extracts placeId from DTO', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await claimApi.submit({
      placeId: 'place-2', contactName: 'Priya', contactEmail: 'p@b.com',
      status: 'pending', adminNotes: '',
    });
    expect(mockFetch.mock.calls[0][0]).toContain('/places/place-2/claim');
  });

  it('status — returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found', status: 404 } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    ));
    const res = await claimApi.status('place-x');
    expect(res).toBeNull();
  });

  it('status — returns claim dto when found', async () => {
    const dto = { placeId: 'p1', contactName: 'X', contactEmail: 'x@y.com', status: 'pending', adminNotes: '' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: dto }));
    const res = await claimApi.status('p1');
    expect(res?.status).toBe('pending');
  });
});

// ── remindersApi ──────────────────────────────────────────────────────────────

describe('remindersApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('subscribe(placeId, eventId) — POSTs to /places/:pid/events/:eid/remind', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await remindersApi.subscribe('place-1', 'event-1');
    expect(mockFetch.mock.calls[0][0]).toContain('/places/place-1/events/event-1/remind');
  });

  it('subscribe(eventId only) — uses legacy /places/me/events/:eid/remind', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await remindersApi.subscribe('event-only');
    expect(mockFetch.mock.calls[0][0]).toContain('/places/me/events/event-only/remind');
  });

  it('unsubscribe — sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 204 }));
    await remindersApi.unsubscribe('place-1', 'event-1');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('icsUrl — returns empty string when no eventId', () => {
    expect(remindersApi.icsUrl('place-1')).toBe('');
  });

  it('icsUrl — returns URL with place and event ids', () => {
    const url = remindersApi.icsUrl('place-1', 'event-2');
    expect(url).toContain('/places/place-1/events/event-2/ics');
  });

  it('create — POSTs to /me/reminders', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await remindersApi.create({ placeId: 'p1', reminderAt: '2025-01-01T10:00:00Z' });
    expect(mockFetch.mock.calls[0][0]).toContain('/me/reminders');
  });
});

// ── reportsApi ────────────────────────────────────────────────────────────────

describe('reportsApi', () => {
  it('submit — POSTs to /reports', async () => {
    tokenStore.set('tok', 'ref');
    mockFetch.mockResolvedValueOnce(new Response('', { status: 201 }));
    await reportsApi.submit({ targetId: 't1', targetType: 'temple', reason: 'spam' });
    expect(mockFetch.mock.calls[0][0]).toContain('/reports');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });
});

// ── providersApi ──────────────────────────────────────────────────────────────

describe('providersApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('list — GETs /providers with no params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { items: [], total: 0, page: 1, limit: 20, hasMore: false } }),
    );
    await providersApi.list();
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/providers$/);
  });

  it('list — appends religion + city params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { items: [], total: 0, page: 1, limit: 20, hasMore: false } }),
    );
    await providersApi.list({ religion: 'hindu', city: 'Delhi' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('religion=hindu');
    expect(url).toContain('city=Delhi');
  });

  it('getById — GETs /providers/:id', async () => {
    const p = { id: 'prov-1', fullName: 'Pandit Ji' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: p }));
    const res = await providersApi.getById('prov-1');
    expect(mockFetch.mock.calls[0][0]).toContain('/providers/prov-1');
    expect(res.fullName).toBe('Pandit Ji');
  });
});

// ── followsApi ────────────────────────────────────────────────────────────────

describe('followsApi', () => {
  beforeEach(() => { tokenStore.set('tok', 'ref'); });

  it('follow — POSTs to /follows with followeeType + followeeId', async () => {
    const follow = { id: 'f1', followerId: 'u1', followeeType: 'temple', followeeId: 'temple-1', createdAt: '' };
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: follow }));
    const res = await followsApi.follow('temple', 'temple-1');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/follows');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.followeeType).toBe('temple');
    expect(body.followeeId).toBe('temple-1');
    expect(res.id).toBe('f1');
  });

  it('unfollow — DELETEs /follows/:id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { success: true } }));
    const res = await followsApi.unfollow('follow-1');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/follows/follow-1');
    expect(init.method).toBe('DELETE');
    expect(res.success).toBe(true);
  });

  it('myFollowing — GETs /me/following and returns items array', async () => {
    const items = [{ id: 'f1', followerId: 'u1', followeeType: 'temple', followeeId: 't1', createdAt: '' }];
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { items } }));
    const res = await followsApi.myFollowing();
    expect(mockFetch.mock.calls[0][0]).toContain('/me/following');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('f1');
  });

  it('count — GETs /follows/count/:type/:id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { count: 42 } }));
    const res = await followsApi.count('temple', 'temple-1');
    expect(mockFetch.mock.calls[0][0]).toContain('/follows/count/temple/temple-1');
    expect(res.count).toBe(42);
  });
});
