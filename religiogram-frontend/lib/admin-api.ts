/**
 * Admin API client — talks to the backend's /v1/admin/* endpoints.
 *
 * All requests carry a Bearer access token from `tokenStore.access` (with a
 * localStorage fallback, matching the pattern in provider-onboarding-api.ts).
 * The caller must be a user whose `role === 'admin'`; the backend enforces
 * this via JwtAuthGuard + RolesGuard + AdminPrefixGuard.
 *
 * Shape of the public surface:
 *   adminApi.applications.list({ status?, limit?, offset? })
 *   adminApi.applications.get(providerId)
 *   adminApi.applications.approve(providerId, notes?)
 *   adminApi.applications.reject(providerId, reason, notes?)
 *   adminApi.applications.requestInfo(providerId, whatToFix)
 *   adminApi.applications.suspend(providerId, reason)
 */

import { ApiError, tokenStore } from './api';

export type AdminApplicationStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface AdminApplicationSummary {
  id: string;
  userId: string;
  fullName: string | null;
  religion: string | null;
  city: string | null;
  status: AdminApplicationStatus;
  updatedAt: string;
  createdAt: string;
}

export interface AdminApplicationListResponse {
  items: AdminApplicationSummary[];
  total: number;
}

export interface AdminKycVideo {
  id: string;
  signedUrl: string;
  durationSeconds: number | null;
  status: string;
  createdAt: string;
}

export interface AdminBankInfo {
  bankName?: string | null;
  ifscCode?: string | null;
  upiId?: string | null;
  beneficiaryName?: string | null;
  masked?: string | null;
  verificationStatus?: string | null;
}

export interface AdminApplicationDetail {
  provider: Record<string, any>;
  kycVideos: AdminKycVideo[];
  panSignedUrl?: string | null;
  selfieSignedUrl?: string | null;
  bank?: AdminBankInfo | null;
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
    (typeof window !== 'undefined'
      ? window.localStorage.getItem('rg_access')
      : null);
  if (init.auth !== false && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Unable to reach the server. Check your connection and try again.',
      0,
    );
  }

  const text = await res.text();
  let json: any = null;
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
  if (!res.ok) {
    throw new ApiError(
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  // Backend envelope is { success: true, data: <T> } — fall back to raw json.
  return (json?.data ?? json) as T;
}

function buildQuery(params?: Record<string, string | number | undefined>) {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/* ─────────────────────────  Dashboard KPIs  ───────────────────────── */

export interface AdminKpis {
  users: {
    total: number;
    seekers: number;
    advisors: number;
    admins: number;
    active: number;
    suspended: number;
    banned: number;
  };
  providers: {
    total: number;
    pending: number;
    approved: number;
  };
  providersByCategory: {
    priest:     { pending: number; approved: number };
    astrologer: { pending: number; approved: number };
    both:       { pending: number; approved: number };
  };
  bookings: {
    total: number;
    completed: number;
    cancelled: number;
  };
  disputes: {
    total: number;
    open: number;
    resolved: number;
  };
  fraud: {
    total: number;
    unresolved: number;
  };
}

/** Fetch dashboard KPI counters. */
export const adminKpis = () => apiFetch<AdminKpis>('/admin/analytics/kpis');

/* ─────────────────────────  Users management  ─────────────────────── */

export type UserRole = 'seeker' | 'advisor' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'pending_verification';

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  isActive: boolean;
  isProvider: boolean;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  provider?: {
    id: string;
    status: string;
    providerCategory: string | null;
    city: string | null;
    bio: string | null;
    ratingAvg: number | null;
    ratingCount: number;
  } | null;
}

export interface AdminUserListResponse {
  items: AdminUserRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const adminUsersApi = {
  list: (params?: {
    role?: UserRole | '';
    status?: AccountStatus | '';
    q?: string;
    cursor?: string;
    limit?: number;
  }) =>
    apiFetch<AdminUserListResponse>(
      `/admin/users${buildQuery({
        role: params?.role || undefined,
        status: params?.status || undefined,
        q: params?.q || undefined,
        cursor: params?.cursor || undefined,
        limit: params?.limit ?? 20,
      })}`,
    ),

  get: (id: string) =>
    apiFetch<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),

  setStatus: (
    id: string,
    body: { status: 'active' | 'suspended' | 'banned'; reason?: string },
  ) =>
    apiFetch<{ id: string; accountStatus: AccountStatus }>(
      `/admin/users/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
};

/* ─────────────────────────  Providers management  ─────────────────── */

/**
 * Provider status as the admin UI sees it. Note: the backend `ProviderStatus`
 * enum uses `pending_review` + `draft`, but the admin providers table
 * normalises those to `pending` for the "ready to review" label. `banned`
 * is a virtual status the moderation UI applies via the `ban` action
 * (backend stores it as `Rejected` with a `BLOCKED:` prefix on
 * rejectionReason). Keep in sync with STATUS_LABEL in
 * app/admin/providers/page.tsx.
 */
export type ProviderStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'banned';

export type ProviderCategory = 'priest' | 'astrologer' | 'both';
export type ServiceMode = 'offline' | 'online' | 'both';
export type ConsultationChannel = 'chat' | 'voice' | 'video';
export type ModerationAction = 'approve' | 'reject' | 'suspend' | 'ban';

export interface AdminProviderRow {
  id: string;
  fullName: string | null;
  city: string | null;
  religion: string | null;
  providerCategory: ProviderCategory;
  status: ProviderStatus;
  ratingAvg: number | null;
  ratingCount: number;
  perMinutePaise: number | null;
  createdAt: string;
}

export interface AdminProviderDetail extends AdminProviderRow {
  bio: string | null;
  experienceYears: number | null;
  languages: string[];
  serviceMode: ServiceMode;
  specialisations: string[];
  specialisationYears?: Record<string, number>;
  consultationChannels: ConsultationChannel[];
}

export interface AdminProviderListResponse {
  items: AdminProviderRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminProviderEditPayload {
  fullName?: string;
  city?: string;
  bio?: string;
  religion?: string;
  experienceYears?: number;
  languages?: string[];
  serviceMode?: ServiceMode;
  providerCategory?: ProviderCategory;
  perMinutePaise?: number;
  specialisations?: string[];
  specialisationYears?: Record<string, number>;
  consultationChannels?: ConsultationChannel[];
}

export const adminProvidersApi = {
  list: (params?: {
    status?: ProviderStatus | '';
    category?: ProviderCategory | '';
    cursor?: string;
    limit?: number;
  }) =>
    apiFetch<AdminProviderListResponse>(
      `/admin/providers${buildQuery({
        status: params?.status || undefined,
        category: params?.category || undefined,
        cursor: params?.cursor || undefined,
        limit: params?.limit ?? 20,
      })}`,
    ),

  get: (id: string) =>
    apiFetch<AdminProviderDetail>(`/admin/providers/${encodeURIComponent(id)}`),

  moderate: (
    id: string,
    body: { action: ModerationAction; reason?: string },
  ) =>
    apiFetch<{ id: string; status: ProviderStatus }>(
      `/admin/providers/${encodeURIComponent(id)}/moderate`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  edit: (id: string, body: AdminProviderEditPayload) =>
    apiFetch<AdminProviderDetail>(
      `/admin/providers/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
};

/* ─────────────────────────  Applications (existing)  ───────────────── */

export const adminApi = {
  applications: {
    list: (params?: { status?: string; limit?: number; offset?: number }) =>
      apiFetch<AdminApplicationListResponse>(
        `/admin/verifications/queue${buildQuery({
          status: params?.status ?? 'pending_review',
          limit: params?.limit ?? 50,
          offset: params?.offset ?? 0,
        })}`,
      ),

    get: (providerId: string) =>
      apiFetch<AdminApplicationDetail>(
        `/admin/verifications/${encodeURIComponent(providerId)}`,
      ),

    approve: (providerId: string, notes?: string) =>
      apiFetch<{ ok: boolean }>(
        `/admin/verifications/${encodeURIComponent(providerId)}/approve`,
        {
          method: 'POST',
          body: JSON.stringify(notes ? { notes } : {}),
        },
      ),

    reject: (providerId: string, reason: string, notes?: string) =>
      apiFetch<{ ok: boolean }>(
        `/admin/verifications/${encodeURIComponent(providerId)}/reject`,
        {
          method: 'POST',
          body: JSON.stringify(notes ? { reason, notes } : { reason }),
        },
      ),

    requestInfo: (providerId: string, whatToFix: string) =>
      apiFetch<{ ok: boolean }>(
        `/admin/verifications/${encodeURIComponent(providerId)}/request_info`,
        {
          method: 'POST',
          body: JSON.stringify({ whatToFix }),
        },
      ),

    suspend: (providerId: string, reason: string) =>
      apiFetch<{ ok: boolean }>(
        `/admin/providers/${encodeURIComponent(providerId)}/suspend`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      ),
  },
};
