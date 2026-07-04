/**
 * Specialisations catalogue API client.
 *
 * Public: `GET /v1/specialisations` — cached at the edge.
 * Admin:  `GET/POST/PATCH/DELETE /v1/admin/specialisations` — requires admin JWT.
 *
 * The wizard picker (Step 3) uses `list()` on mount; if the network fails
 * we fall back to the shipped constants so onboarding never gets stuck.
 * Admin panel uses the admin endpoints directly — no fallback there.
 */

import { ApiError, tokenStore } from './api';

export interface SpecItem {
  slug: string;
  name: string;
  isTrending: boolean;
  isPremiumOnly: boolean;
}

export interface SpecCategory {
  category: string;
  items: SpecItem[];
}

export interface SpecAdminRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isTrending: boolean;
  isPremiumOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/v1';
  }
  return 'https://api.religiogram.com/api/v1';
})();

async function apiFetch<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token =
    tokenStore.access ??
    (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null);
  if (init.auth !== false && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try { json = JSON.parse(text); }
    catch { throw new ApiError('INVALID_RESPONSE', 'Non-JSON response', res.status); }
  }
  if (!res.ok) {
    throw new ApiError(
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return (json?.data ?? json) as T;
}

export const specialisationsApi = {
  /** Public — used by the wizard picker. */
  list: () =>
    apiFetch<{ categories: SpecCategory[] }>('/specialisations', { auth: false }),
};

export interface RankingRow {
  id: string;
  fullName: string;
  city: string | null;
  providerCategory: 'priest' | 'astrologer' | 'both';
  rankingScore: number;
  ratingAvg: number | null;
  ratingCount: number;
  completedBookingsCount: number;
  isOnline: boolean;
  isVerified: boolean;
  experienceYears: number | null;
  lastActivityAt: string | null;
}

export const adminRankingApi = {
  top: (limit = 50) =>
    apiFetch<{ items: RankingRow[] }>(`/admin/ranking/top?limit=${limit}`),
  recomputeAll: () =>
    apiFetch<{ updated: number; ms: number }>(`/admin/ranking/recompute`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export const adminSpecialisationsApi = {
  /** Admin list — includes inactive rows. */
  listAll: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return apiFetch<{ items: SpecAdminRow[] }>(`/admin/specialisations${qs}`);
  },
  create: (body: Partial<SpecAdminRow>) =>
    apiFetch<SpecAdminRow>('/admin/specialisations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<SpecAdminRow>) =>
    apiFetch<SpecAdminRow>(`/admin/specialisations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/admin/specialisations/${id}`, { method: 'DELETE' }),
  usage: (id: string) =>
    apiFetch<{ id: string; slug: string; name: string; providers: number }>(
      `/admin/specialisations/${id}/usage`,
    ),
  reorder: (items: Array<{ id: string; sortOrder: number }>) =>
    apiFetch<{ updated: number }>(`/admin/specialisations/reorder`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
};
