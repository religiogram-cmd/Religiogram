/**
 * ReligioGram API client.
 * Handles:
 *   - Base URL configuration (env-driven)
 *   - Token storage: in-memory access token + localStorage-backed refresh
 *   - Auto-refresh on 401 with request queueing (no thundering-herd refresh)
 *   - Uniform error shape { success: false, error: { code, message } }
 *   - Safe JSON parsing (malformed responses don't crash the client)
 *   - Network errors surfaced as a typed ApiError with code NETWORK_ERROR
 */

const DEFAULT_API_BASE = 'https://api.religiogram.com/api/v1';

const API_BASE = (() => {
  // Prefer explicit env var — set NEXT_PUBLIC_API_BASE in .env.local / .env.production
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  // Dev convenience: use relative path so Next.js rewrites proxy to the backend.
  // This avoids the frontend ever talking to its own port directly.
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/v1';
  }
  return DEFAULT_API_BASE;
})();

/* ════════════════════════════════════════════════════════════════════════
 * v9 (P0-2 fix): cookie-mode refresh is now the DEFAULT.
 *
 * Refresh tokens are stored in an HttpOnly+Secure+SameSite=strict cookie set
 * by the backend on /v1/auth/refresh, /v1/auth/verify-otp,
 * /v1/auth/google/callback, /v1/auth/register, /v1/auth/login. The cookie is
 * never accessible to JavaScript, so XSS cannot exfiltrate the credential.
 *
 * CSRF protection: the backend ALSO sets an `rg_csrf` cookie (not HttpOnly)
 * containing a per-session token. Every mutating request must echo it in the
 * X-CSRF-Token header (double-submit pattern). The backend rejects mutations
 * whose header value does not match the cookie.
 *
 * Body mode is retained ONLY as an explicit operator opt-out for environments
 * that cannot use cookies (native apps without cookie-jar plumbing). Set
 * NEXT_PUBLIC_REFRESH_TOKEN_TRANSPORT=body to enable it. Body mode logs a
 * warning to console on every page load so it can never quietly become the
 * default again.
 * ══════════════════════════════════════════════════════════════════════ */
const COOKIE_MODE: boolean = false; // FORCED Bearer-token mode for cross-origin reliability

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/* ────────── Token storage ──────────
 * Access tokens live in memory only (short-lived, 15 min). Refresh tokens
 * live in an HttpOnly cookie by default; localStorage is used ONLY in
 * explicit body mode.
 */
let accessTokenMem: string | null = (typeof window !== 'undefined' ? (() => { try { return window.localStorage.getItem('rg_access'); } catch { return null; } })() : null);

const REFRESH_STORAGE_KEY = 'rg_refresh';

export const tokenStore = {
  get access(): string | null {
    return accessTokenMem;
  },
  get refresh(): string | null {
    if (COOKIE_MODE) return null; // v9: never read; the cookie is the source of truth
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string) {
    accessTokenMem = access;
    try { if (typeof window !== 'undefined') window.localStorage.setItem('rg_access', access); } catch {}
    if (COOKIE_MODE) return; // v9: cookie holds refresh; never persist
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    } catch {
      // localStorage disabled (private mode, strict CSP) — fall back to
      // in-memory only. Refresh will fail on next page load → user is
      // logged out. Acceptable.
    }
  },
  clear() {
    accessTokenMem = null;
    try { if (typeof window !== 'undefined') window.localStorage.removeItem('rg_access', ); } catch {}
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(REFRESH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** v9: exposed for tests + the wallet-api/socials-api modules that previously
 * had bespoke token reads. They MUST use this canonical store. */
export const isCookieMode = (): boolean => COOKIE_MODE;

   /*  Error types  */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

   /*  Core request wrapper  */
interface RequestOpts extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  deviceId?: string;
}

/** v9: methods that mutate state. Cookie mode requires CSRF on these. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  return request<T>(path, opts);
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const isMutation = MUTATING_METHODS.has(method);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.deviceId) headers['X-Device-Id'] = opts.deviceId;
  if (opts.auth !== false && tokenStore.access) {
    headers['Authorization'] = `Bearer ${tokenStore.access}`;
  }

  // v9 (P1-3 fix): CSRF double-submit applied to every mutating request when
  // running in cookie mode. The backend rejects with 403 if header ≠ cookie.
  // Reads (GET/HEAD) are CSRF-exempt by spec.
  if (COOKIE_MODE && isMutation) {
    const csrf = getCookie('rg_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...opts,
        method,
        headers,
        // v9: cookie mode requires `credentials: 'include'` so the HttpOnly
        // refresh cookie and the readable CSRF cookie are sent.
        credentials: COOKIE_MODE ? 'include' : opts.credentials ?? 'same-origin',
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      throw new ApiError(
        'NETWORK_ERROR',
        'Unable to reach the server. Check your connection and try again.',
        0,
      );
    }
  };

  const res = await doFetch();

  // Auto-refresh on 401. In cookie mode tokenStore.refresh is always null, so
  // we drop that gating condition and rely on `opts.auth` to decide whether
  // a refresh attempt is worth making.
  if (res.status === 401 && opts.auth && (COOKIE_MODE || tokenStore.refresh)) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${tokenStore.access}`;
      // v9: re-read CSRF after refresh — backend issues a new csrf cookie on refresh
      if (COOKIE_MODE && isMutation) {
        const csrf = getCookie('rg_csrf');
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const retry = await doFetch();
      return handleResponse<T>(retry);
    }
    // Refresh failed — propagate as auth error
    tokenStore.clear();
  }

  return handleResponse<T>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON response (e.g. HTML error page from a proxy, or a 502 from
      // the load balancer)  don't let it crash the client.
      throw new ApiError(
        'INVALID_RESPONSE',
        `Server returned a non-JSON response (status ${res.status}).`,
        res.status,
      );
    }
  }

  type Envelope = {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  const body = (json ?? {}) as Envelope;

  if (!res.ok) {
    const code = body.error?.code ?? 'UNKNOWN';
    const msg = body.error?.message ?? `Request failed (${res.status})`;
    const retryAfter = res.headers.get('retry-after');
    throw new ApiError(
      code,
      msg,
      res.status,
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    );
  }

  // Backend envelope is { success: true, data: <T>, meta: {...} }.
  // Some endpoints return the object directly  support both.
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return json as T;
}

/**
 * Single-flight refresh — all concurrent callers await the same promise
 * so we never hit /auth/refresh more than once at a time per page
 * (which would trip the backend's one-time-use refresh-token check and
 * force a global logout).
 *
 * P1 fix: refreshInFlight is set BEFORE the async work starts so that any
 * concurrent 401 handler that arrives while the refresh is in-flight awaits
 * the same promise (thundering-herd prevention).
 */
let refreshInFlight: Promise<boolean> | null = null;
// P1-10 (v5): used by /auth/refresh fetch options below.
function refreshFetchOptions(refreshFromBody: string | null): RequestInit {
  if (COOKIE_MODE) {
    const csrf = getCookie('rg_csrf') ?? '';
    return {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({}),
    };
  }
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshFromBody }),
  };
}

export async function tryRefresh(): Promise<boolean> {
  // If a refresh is already in-flight, all concurrent callers share the same
  // promise — this is the thundering-herd prevention. The assignment of
  // refreshInFlight happens synchronously BEFORE any await, so any 401
  // handlers that arrive concurrently will find the promise already set.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = tokenStore.refresh;
    // v7 (P0-NEW-3 fix): in cookie mode there's no localStorage refresh —
    // the httpOnly cookie carries it. We still attempt the refresh as long
    // as we previously had an access token (in-memory). Without that signal
    // we can't tell logged-out vs cookie-mode-just-loaded; treat as unauth.
    if (!refresh && !COOKIE_MODE) {
      tokenStore.clear();
      return false;
    }
    // Network-layer timeout: abort the underlying socket after 4s so a
    // hung / unreachable backend can never keep the fetch alive forever.
    // Without this, a wrapper-level timeout (Promise.race etc.) resolves the
    // caller's promise but the request itself stays pending and pins
    // refreshInFlight to a zombie promise — every subsequent call returns
    // the same hung promise.
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 4000);
    try {
      // v7 (P0-NEW-3 fix): actually USE refreshFetchOptions(). In cookie mode
      // the request rides the httpOnly cookie + X-CSRF-Token header. In body
      // mode the refresh token is in the POST body, untouched from v3.
      const baseOpts = refreshFetchOptions(refresh);
      const res = await fetch(`${API_BASE}/auth/refresh`, { ...baseOpts, signal: controller.signal });
      clearTimeout(abortTimer);
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      let payload: { data?: { tokens?: { accessToken: string; refreshToken: string } } };
      try {
        payload = await res.json();
      } catch {
        tokenStore.clear();
        return false;
      }
      const tokens = payload?.data?.tokens;
      if (!tokens?.accessToken || !tokens?.refreshToken) {
        tokenStore.clear();
        return false;
      }
      tokenStore.set(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch {
      clearTimeout(abortTimer);
      tokenStore.clear();
      return false;
    }
  })();

  // Clear the singleton after completion so future token expirations
  // trigger a fresh refresh rather than re-using a settled promise.
  refreshInFlight.finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

   /*  Auth endpoints  */
export const authApi = {
  sendOtp: (phone: string, deviceId?: string) =>
    request<{ message: string; expiresIn: number; resendAfter: number }>(
      '/auth/send-otp',
      { method: 'POST', body: { phone, deviceId } },
    ),

  verifyOtp: (phone: string, otp: string, deviceId?: string) =>
    request<AuthResponse>('/auth/verify-otp', {
      method: 'POST',
      body: { phone, otp, deviceId },
    }),

  refresh: () =>
    request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tokenStore.refresh },
    }),

  /**
   * Logout. Sends the request to the server so the refresh token is
   * invalidated server-side, THEN clears local storage. If the server call
   * fails (offline, 500), we still clear locally  staying logg
   * broken session is worse than having to re-login.
   */
  logout: async (): Promise<void> => {
    try {
      await request<void>('/auth/logout', { method: 'POST', auth: true });
    } catch {
   /* non-fatal  clear anyway */
    } finally {
      tokenStore.clear();
    }
  },

  googleUrl: () => `${API_BASE}/auth/google`,

  devLogin: (email: string, password: string, role = 'seeker') =>
    request<AuthResponse>('/auth/dev-login', {
      method: 'POST',
      body: { email, password, role },
    }),

   /** Real email + password registration — creates a new account. */
  register: (email: string, password: string, name?: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, name },
    }),

  /** Real email + password sign-in. */
  emailLogin: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
};

   /*  Users endpoints  */
export interface AuthResponse {
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  user: PublicUser;
  isNewUser?: boolean;
}

   /*  User types  */

export interface PublicUser {
  id: string;
  fullName: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  createdAt?: string;
}

export const usersApi = {
  me: () =>
    request<PublicUser & { createdAt: string }>('/users/me', {
      method: 'GET',
      auth: true,
    }),

  updateProfile: (patch: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  }) =>
    request<Pick<PublicUser, 'id' | 'name' | 'email' | 'avatarUrl'>>(
      '/users/me',
      { method: 'PATCH', auth: true, body: patch },
    ),

  /**
   * Legacy role-pick endpoint. The current build does not call
   * selection has been removed from the user-facing flow  but 
   * is retained for the eventual provider/priest reactivation.
   *
   * @deprecated Not used by any active screen as of this release.
   */
  updateRole: (role: 'seeker' | 'advisor') =>
    request<{ id: string; role: 'seeker' | 'advisor' }>('/users/me/role', {
      method: 'PATCH',
      auth: true,
      body: { role },
    }),
};

   /*  Profile endpoints  */
/**
 * Profile is intentionally separate from the slim `users` table. Users
 * holds auth-critical fields (phone, role, isVerified); profile holds the
 * fuller identity collected through the multi-step setup wizard.
 *
 * The wizard saves drafts to PATCH /profile after every meaningful step.
   * The backend treats partial bodies as merges  null/missing 
 * left untouched, so we never have to send the whole document on every
 * keystroke.
 */
export interface ProfilePayload {
  /** Wizard step the user has reached (0-indexed). */
  step?: number;
  /** Free-form bag of step-owned fields (validated server-side per step). */
  data?: Record<string, unknown>;
  /** Set by the wizard's finalize call. */
  completed?: boolean;
}

export interface ProfileResponse {
  userId: string;
  step: number;
  data: Record<string, unknown>;
  completed: boolean;
  updatedAt: string;
}

export const profileApi = {
   /** Read current profile. Returns 404 if none yet exists. */
  get: () =>
    request<ProfileResponse>('/profile', { method: 'GET', auth: true }),

   /** Create initial profile row. Idempotent — server returns existing row. */
  create: (body: ProfilePayload) =>
    request<ProfileResponse>('/profile', { method: 'POST', auth: true, body }),

  /** Partial update. Backend deep-merges `data`. */
  update: (body: ProfilePayload) =>
    request<ProfileResponse>('/profile', { method: 'PATCH', auth: true, body }),
};

   /*  Favorites  */

/**
 * A favourited temple, as returned by GET /favorites. Extends the base
 * Temple shape with `favouritedAt` so the list page can sort/group by
 * recency if we ever want to.
 */
export interface FavoriteTemple {
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
  /** ISO timestamp. */
  favouritedAt: string;
}

/**
   * Favorites API  persists across sessions via the backend.
 */
export const favoritesApi = {
  list: (): Promise<FavoriteTemple[]> =>
    request<FavoriteTemple[]>('/users/me/favourites', { auth: true }),

  /** Batch-check which of the given IDs are favourited. */
  ids: (templeIds: string[]): Promise<{ ids: string[] }> =>
    request<{ ids: string[] }>('/users/me/favourites/check', {
      method: 'POST',
      auth: true,
      body: { ids: templeIds },
    }),

  // auth:true — these are state-changing endpoints that require a valid JWT
  add: (templeId: string): Promise<void> =>
    request<void>(`/users/me/favourites/${templeId}`, { method: 'POST', auth: true }),

  remove: (templeId: string): Promise<void> =>
    request<void>(`/users/me/favourites/${templeId}`, { method: 'DELETE', auth: true }),
};


   /*
   PLACES, CLAIMS, REMINDERS, REPORTS
   Real implementations  call the NestJS backend.
   */

export type PlaceType = 'temple' | 'mosque' | 'church' | 'gurudwara' | 'other';
export type ReportTargetType = 'temple' | 'review' | 'user' | 'event' | 'service';

export interface NearbyPlace {
  id: string;
  name: string;
  type: PlaceType;
  lat: number;
  lng: number;
  city: string;
  state: string | null;
  address: string | null;
  imageUrl: string | null;
  isVerified: boolean;
  distanceM: number;
  distanceKm: number;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface PlaceEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  recurring: boolean;
  icsUrl: string;
}

export interface PlaceServiceItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface PlaceClaimDto {
  placeId: string;
  contactName: string;
  contactEmail: string;
  message?: string;
  status: string;
  adminNotes: string;
}

export interface PlaceDetail extends NearbyPlace {
  description: string | null;
  hours: string | null;
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  upcomingEvents: PlaceEvent[];
  events: PlaceEvent[];
  services: PlaceServiceItem[];
}

export const placesApi = {
  /** GET /places/nearby?lat=&lng=&city=&limit=&radiusKm= */
  nearby(
    anchorOrParams: string | { lat?: number; lng?: number; city?: string; limit?: number; radiusKm?: number },
    params?: { lat?: number; lng?: number; city?: string; limit?: number; radiusKm?: number },
  ): Promise<NearbyPlace[]> {
    const p = typeof anchorOrParams === 'string'
      ? { city: anchorOrParams, ...(params ?? {}) }
      : anchorOrParams;
    const qs = new URLSearchParams();
    if (p.lat   != null) qs.set('lat',      String(p.lat));
    if (p.lng   != null) qs.set('lng',      String(p.lng));
    if (p.city)          qs.set('city',     p.city);
    if (p.limit != null) qs.set('limit',    String(p.limit));
    if (p.radiusKm != null) qs.set('radiusKm', String(p.radiusKm));
    return request<NearbyPlace[]>(`/places/nearby?${qs}`, { auth: true });
  },

  /** GET /places/:id */
  getById(id: string, _opts?: Record<string, unknown>): Promise<PlaceDetail> {
    return request<PlaceDetail>(`/places/${encodeURIComponent(id)}`, { auth: true });
  },

  /** Alias of getById for components using the older name */
  get(id: string, opts?: Record<string, unknown>): Promise<PlaceDetail> {
    return placesApi.getById(id, opts);
  },
};

export const claimApi = {
  /** POST /places/:id/claim */
  submit(idOrDto: string | PlaceClaimDto, body?: Record<string, unknown>): Promise<void> {
    const placeId = typeof idOrDto === 'string' ? idOrDto : idOrDto.placeId;
    const payload = typeof idOrDto === 'string' ? body : idOrDto;
    return request<void>(`/places/${encodeURIComponent(placeId)}/claim`, {
      method: 'POST',
      body:   payload,
      auth:   true,
    });
  },

  /** GET /places/:id/claim/status */
  status(placeId: string): Promise<PlaceClaimDto | null> {
    return request<PlaceClaimDto | null>(`/places/${encodeURIComponent(placeId)}/claim/status`, { auth: true })
      .catch((err: ApiError) => {
        if (err.status === 404) return null;
        throw err;
      });
  },
};

export const remindersApi = {
  /** POST /places/:placeId/events/:eventId/remind */
  subscribe(placeId: string, eventId?: unknown): Promise<void> {
    const eid = eventId ? String(eventId) : placeId;
    const pid = eventId ? placeId : 'me';
    if (!eventId) {
      // legacy single-arg form: first arg is eventId
      return request<void>(`/places/me/events/${encodeURIComponent(eid)}/remind`, {
        method: 'POST', auth: true,
      });
    }
    return request<void>(`/places/${encodeURIComponent(pid)}/events/${encodeURIComponent(eid)}/remind`, {
      method: 'POST', auth: true,
    });
  },

  unsubscribe(placeId: string, eventId?: unknown): Promise<void> {
    const eid = eventId ? String(eventId) : placeId;
    const pid = eventId ? placeId : 'me';
    const eidStr = eventId ? String(eventId) : eid;
    return request<void>(`/places/${encodeURIComponent(pid)}/events/${encodeURIComponent(eidStr)}/remind`, {
      method: 'DELETE', auth: true,
    });
  },

  /** GET /places/:placeId/events/:eventId/ics */
  icsUrl(placeId: string, eventId?: unknown): string {
    const eid = eventId ? String(eventId) : '';
    if (!eid) return '';
    return `${API_BASE}/places/${encodeURIComponent(placeId)}/events/${encodeURIComponent(eid)}/ics`;
  },

  create(body: { placeId: string; reminderAt: string }): Promise<void> {
    return request<void>('/me/reminders', { method: 'POST', body, auth: true });
  },
};

export const reportsApi = {
  /** POST /reports */
  submit(body: { targetId: string; targetType: ReportTargetType; reason: string; placeId?: string }): Promise<void> {
    return request<void>('/reports', { method: 'POST', body, auth: true });
  },
};

   /*
   PROVIDERS (Priests / Service providers)
   GET /providers           paginated list
   GET /providers/:id       single provider
   */

export interface ProviderService {
  id: string;
  name: string;
  basePricePaise: number;
  durationMinutes: number;
  mode: 'online' | 'offline' | 'both';
}

export interface Provider {
  id: string;
  fullName: string;
  city: string;
  religion: 'hindu' | 'islam' | 'sikh' | 'christian' | 'other' | null;
  experienceYears: number | null;
  languages: string[];
  bio: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  services: ProviderService[];
}

export interface ProvidersListResult {
  items: Provider[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export const providersApi = {
  /** GET /providers?religion=&city=&search=&page=&limit= */
  list(params?: {
    religion?: string;
    city?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ProvidersListResult> {
    const qs = new URLSearchParams();
    if (params?.religion) qs.set('religion', params.religion);
    if (params?.city)     qs.set('city',     params.city);
    if (params?.search)   qs.set('search',   params.search);
    if (params?.page)     qs.set('page',     String(params.page));
    if (params?.limit)    qs.set('limit',    String(params.limit));
    const q = qs.toString();
    return request<ProvidersListResult>(`/providers${q ? `?${q}` : ''}`, { auth: true });
  },

  /** GET /providers/:id */
  getById(id: string): Promise<Provider> {
    return request<Provider>(`/providers/${encodeURIComponent(id)}`, { auth: true });
  },
};

/* SOCIAL MODULE - types & API */

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface SocialUser {
  id: string;
  fullName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
  friendshipStatus?: FriendshipStatus | null;
  friendshipId?: string | null;
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  requester?: SocialUser;
  addressee?: SocialUser;
}

export interface SocialPost {
  id: string;
  caption: string | null;
  imageUrls: string[];
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  author: SocialUser | null;
}

export interface PostComment {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  author: SocialUser | null;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  sender?: SocialUser;
  recipient?: SocialUser;
}

export interface DmThread {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const socialApi = {
  // User search
  searchUsers: (q: string): Promise<SocialUser[]> =>
    request(`/social/users/search?q=${encodeURIComponent(q)}`, { auth: true }),

  // Friends
  getFriends: (): Promise<SocialUser[]> =>
    request('/social/friends', { auth: true }),
  getPendingRequests: (): Promise<Friendship[]> =>
    request('/social/friends/requests/pending', { auth: true }),
  getSentRequests: (): Promise<Friendship[]> =>
    request('/social/friends/requests/sent', { auth: true }),
  sendFriendRequest: (userId: string): Promise<Friendship> =>
    request('/social/friends/request', { method: 'POST', body: { userId }, auth: true }),
  acceptRequest: (friendshipId: string): Promise<Friendship> =>
    request(`/social/friends/request/${friendshipId}/accept`, { method: 'PATCH', auth: true }),
  rejectRequest: (friendshipId: string): Promise<Friendship> =>
    request(`/social/friends/request/${friendshipId}/reject`, { method: 'PATCH', auth: true }),
  removeFriend: (friendshipId: string): Promise<void> =>
    request(`/social/friends/${friendshipId}`, { method: 'DELETE', auth: true }),

  // Posts & feed
  getFeed: (page = 1): Promise<PaginatedResult<SocialPost>> =>
    request(`/social/feed?page=${page}`, { auth: true }),
  createPost: (body: { caption?: string; imageUrls?: string[] }): Promise<SocialPost> =>
    request('/social/posts', { method: 'POST', body, auth: true }),
  getUserPosts: (userId: string, page = 1): Promise<PaginatedResult<SocialPost>> =>
    request(`/social/posts/user/${userId}?page=${page}`, { auth: true }),
  toggleLike: (postId: string): Promise<{ liked: boolean }> =>
    request(`/social/posts/${postId}/like`, { method: 'POST', auth: true }),
  deletePost: (postId: string): Promise<void> =>
    request(`/social/posts/${postId}`, { method: 'DELETE', auth: true }),

  // Comments
  getComments: (postId: string, page = 1): Promise<PaginatedResult<PostComment>> =>
    request(`/social/posts/${postId}/comments?page=${page}`, { auth: true }),
  addComment: (postId: string, content: string): Promise<PostComment> =>
    request(`/social/posts/${postId}/comments`, { method: 'POST', body: { content }, auth: true }),
  deleteComment: (commentId: string): Promise<void> =>
    request(`/social/comments/${commentId}`, { method: 'DELETE', auth: true }),

  // DMs
  getInbox: (): Promise<DmThread[]> =>
    request('/social/messages', { auth: true }),
  getConversation: (userId: string, page = 1): Promise<PaginatedResult<DirectMessage>> =>
    request(`/social/messages/${userId}?page=${page}`, { auth: true }),
  sendMessage: (recipientId: string, content: string): Promise<DirectMessage> =>
    request('/social/messages', { method: 'POST', body: { recipientId, content }, auth: true }),
};

/* FOLLOWS - priests and temples */

export type FolloweeType = 'provider' | 'temple';

export interface Follow {
  id: string;
  followerId: string;
  followeeType: FolloweeType;
  followeeId: string;
  createdAt: string;
}

export const followsApi = {
  /** POST /follows — follow a provider or temple. Returns the follow record. */
  follow(followeeType: FolloweeType, followeeId: string): Promise<Follow> {
    return request<Follow>('/follows', {
      method: 'POST',
      body: { followeeType, followeeId },
      auth: true,
    });
  },

  /** DELETE /follows/:id — unfollow */
  unfollow(followId: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/follows/${encodeURIComponent(followId)}`, {
      method: 'DELETE',
      auth: true,
    });
  },

  /** GET /me/following — all follows for the current user */
  myFollowing(): Promise<{ items: Follow[] }> {
    return request<{ items: Follow[] }>('/me/following', { auth: true });
  },

  /** GET /follows/count/:type/:id — follower count for a provider or temple */
  count(type: FolloweeType, id: string): Promise<{ count: number }> {
    return request<{ count: number }>(`/follows/count/${type}/${encodeURIComponent(id)}`, { auth: true });
  },
};
