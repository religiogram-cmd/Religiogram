/**
 * Temples API client.
 *
 * Exposes typed helpers for the three discovery endpoints:
 *   GET /temples/nearby  — geo query (Local tab)
 *   GET /temples         — paged / searched list (All-India tab)
 *   GET /temples/:id     — single-temple details
 *
 * Each helper takes an optional AbortSignal so callers can cancel the
 * in-flight request when the user types a new query. The shared api
 * module (`./api`) already wires auth + refresh + envelope unwrapping,
 * so we extend it with a thin fetch for abortable GETs.
 */
import { tokenStore, ApiError } from './api';

export class TempleApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TempleApiError';
  }
}



const DEFAULT_API_BASE = 'https://api.religiogram.com/api/v1';

const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/v1';
  }
  return DEFAULT_API_BASE;
})();

export interface Temple {
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
  /** Metres from the user's location — present only on /nearby results. */
  distanceM?: number;
}

export interface TempleListResult {
  items: Temple[];
  total: number;
  page: number;
  limit: number;
  /** Backend tells us when more pages exist so we can stop infinite scroll. */
  hasMore: boolean;
}

/**
 * Abortable GET with auth + envelope unwrapping.
 *
 * Retries a single time with a 400 ms backoff on pure network failure
 * (the `fetch` promise itself rejected, e.g. flaky Wi-Fi, DNS blip, 502
 * from a rolling deploy). HTTP status errors (4xx / 5xx with a body)
 * are NOT retried here — they're deterministic and the caller should
 * decide. Aborts propagate immediately.
 *
 * We don't reuse the main `request()` from api.ts because it doesn't
 * thread an AbortSignal all the way through — duplicating ~30 lines here
 * keeps callers clean and avoids a refactor of the broader client.
 */
async function abortableGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if ((tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null))) {
    headers['Authorization'] = `Bearer ${(tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null))}`;
  }

  /**
   * One-shot retry on `fetch` rejection. A single retry handles the
   * common case (transient DNS, proxy restart, mobile radio switch)
   * without letting a persistent outage double every user's latency.
   * 400 ms delay is empirically long enough to clear a TCP reconnect
   * but short enough that the UI spinner doesn't feel broken.
   */
  const fetchWithRetry = async (): Promise<Response> => {
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        headers,
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      // Wait 400 ms then retry once. We bail immediately on a second
      // failure so the error surface stays meaningful.
      await new Promise((r) => setTimeout(r, 400));
      if (signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      try {
        return await fetch(`${API_BASE}${path}`, {
          method: 'GET',
          headers,
          signal,
        });
      } catch (err2) {
        if ((err2 as Error).name === 'AbortError') throw err2;
        throw new ApiError(
          'NETWORK_ERROR',
          'Unable to reach the server. Check your connection and try again.',
          0,
        );
      }
    }
  };

  let res: Response;
  try {
    res = await fetchWithRetry();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err; // let callers swallow quietly
    throw err;
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        `Server returned a non-JSON response (status ${res.status}).`,
        res.status,
      );
    }
  }

  const body = (json ?? {}) as {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    const code = body.error?.code ?? 'UNKNOWN';
    const msg = body.error?.message ?? `Request failed with status ${res.status}`;
    throw new TempleApiError(code, msg, res.status);
  }

  return body.data as T;
}

/* ─── API client ─────────────────────────────────────────────── */

export interface NearbyParams {
  lat?: number;
  lng?: number;
  city?: string;
  radiusKm?: number;
  limit?: number;
}

export interface ListParams {
  search?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface SearchParams {
  q: string;
  limit?: number;
}

export const templesApi = {
  /**
   * GET /temples/nearby — returns temples near a GPS coordinate or city slug.
   * Results include `distanceM` for sorting/display.
   */
  nearby: (params: NearbyParams, signal?: AbortSignal): Promise<Temple[]> => {
    const qs = new URLSearchParams();
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lng !== undefined) qs.set('lng', String(params.lng));
    if (params.city) qs.set('city', params.city);
    if (params.radiusKm !== undefined) qs.set('radiusKm', String(params.radiusKm));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return abortableGet<Temple[]>(`/temples/nearby?${qs}`, signal);
  },

  /**
   * GET /temples — paged list with optional full-text search + city filter.
   */
  list: (params: ListParams = {}, signal?: AbortSignal): Promise<TempleListResult> => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.city) qs.set('city', params.city);
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return abortableGet<TempleListResult>(`/temples?${qs}`, signal);
  },

  /**
   * GET /temples/search — lightweight autocomplete endpoint.
   * Returns a small slice of matching temples for the search-bar dropdown.
   */
  search: (params: SearchParams, signal?: AbortSignal): Promise<Temple[]> => {
    const qs = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return abortableGet<Temple[]>(`/temples/search?${qs}`, signal);
  },

  /**
   * GET /temples/:id — single temple with full details.
   */
  getById: (id: string, signal?: AbortSignal): Promise<Temple> =>
    abortableGet<Temple>(`/temples/${id}`, signal),

  /** Alias for getById — used by TempleDetail component. */
  get: (id: string, signal?: AbortSignal): Promise<Temple> =>
    abortableGet<Temple>(`/temples/${id}`, signal),
};
