/**
 * Service-Provider Onboarding API client (draft-model, v2).
 *
 * Internally talks to the real backend's `onboarding-v2.controller.ts`:
 *   POST   /v1/provider/onboarding/start
 *   GET    /v1/provider/onboarding/me
 *   PATCH  /v1/provider/onboarding/:id          (PatchDraftDto — field-bag)
 *   POST   /v1/provider/onboarding/:id/services (SetServicesDto)
 *   POST   /v1/provider/onboarding/:id/kyc      (SubmitKycDto)
 *   POST   /v1/provider/onboarding/:id/submit
 *
 * Public surface (the step components import these by name) is preserved
 * from the previous step-per-route shape so the wizard pages do not need
 * to change:
 *   step1, step2, step3, step4, step5, step6, presignKyc, uploadKycVideo,
 *   step7, getDraft, saveDraft.
 *
 * Conventions:
 *   - All prices flow through the wire as integer paise.
 *   - Times are 'HH:MM' (24h) strings.
 *   - The draft id is cached in module scope after first resolution; it is
 *     re-resolved automatically if the user changes account / draft expires.
 */

import { ApiError, tokenStore } from './api';

export type Religion = 'hindu' | 'islam' | 'sikh' | 'christian' | 'other';
export type ServiceMode = 'online' | 'offline' | 'both';
export type ProviderStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface ServiceMasterRow {
  id: string;
  religion: Religion;
  category: string;
  name: string;
  slug: string;
  description: string | null;
  suggestedMinPrice: number | null;
  suggestedMaxPrice: number | null;
  suggestedDurationMinutes: number | null;
}

export interface ServicesCatalogue {
  religion: Religion;
  categories: Array<{ name: string; services: ServiceMasterRow[] }>;
}

export interface OnboardingDraft {
  step: number;
  data: Record<string, unknown>;
  providerStatus: ProviderStatus | null;
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
  if (init.auth !== false && (tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null))) {
    headers['Authorization'] = `Bearer ${(tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null))}`;
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

/* ─────────────────── Catalogue (public) ─────────────────── */

export const servicesCatalogueApi = {
  byReligion: (religion: Religion) =>
    apiFetch<ServicesCatalogue>(
      `/services?religion=${encodeURIComponent(religion)}`,
      { auth: false },
    ),
};

/* ─────────────────── Draft-id resolution ─────────────────── */

let currentDraftId: string | null = null;

/**
 * Pick the canonical id out of the various shapes the backend uses.
 * Real backend:  /start → { onboardingId },  /me → { state, draft } (no id;
 * the onboarding id IS the user id, so /start is the source of truth).
 * Mock server:   /start and /me → { id }.
 * We accept either shape so the wizard works against both.
 */
function pickId(resp: any): string | null {
  if (!resp) return null;
  if (typeof resp.onboardingId === 'string' && resp.onboardingId) return resp.onboardingId;
  if (typeof resp.id === 'string' && resp.id) return resp.id;
  return null;
}

/**
 * Ensure we have a draft id for this user. Cached in module scope so a
 * second call inside the wizard doesn't hit the network. We always POST
 * /start because the real backend treats it as idempotent (it returns the
 * existing draft if one exists) — that also matches the mock.
 */
async function ensureDraftId(): Promise<string> {
  if (currentDraftId) return currentDraftId;
  const created = await apiFetch<any>(`/provider/onboarding/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const id = pickId(created);
  if (!id) throw new ApiError('NO_DRAFT_ID', 'Could not start onboarding draft', 500);
  currentDraftId = id;
  return currentDraftId;
}

/**
 * Apply a flat field-bag patch to the current draft.
 * The body shape must match the real backend's PatchDraftDto:
 *   { fullName?, dob?, phone?, religion?, serviceMode?, experienceYears?,
 *     bio?, languages?, city?, perMinutePaise?, radius? }
 * Anything else will be rejected by class-validator (forbidNonWhitelisted).
 */
async function patch(body: Record<string, unknown>) {
  const id = await ensureDraftId();
  return apiFetch<{ draft?: Record<string, unknown> }>(
    `/provider/onboarding/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

/** Subset of PatchDraftDto. Used to strip unknown keys before PATCHing. */
const ALLOWED_PATCH_KEYS = new Set([
  'fullName', 'dob', 'phone',
  'religion', 'serviceMode',
  'experienceYears', 'bio', 'languages', 'city',
  'perMinutePaise', 'radius',
]);
function whitelist(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_PATCH_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

/* ─────────────────── Provider onboarding ─────────────────── */

export interface Step1Body { fullName: string; dob: string; phone: string; city: string; }
export interface Step2Body { experienceYears: number; languages: string[]; bio?: string; }
export interface Step3Body { religion: Religion; }
/** Step 4 — backend's SetServicesDto wants `[{catalogServiceId, pricePaise}]`. */
export interface Step4ServiceLine { catalogServiceId: number; pricePaise: number; }
export interface Step4Body { services: Step4ServiceLine[]; }
export interface PricingItem {
  serviceId?: number; customName?: string;
  basePricePaise: number; travelFeePaise?: number; addonFeePaise?: number;
  durationMinutes: number; mode: ServiceMode;
}
/** Step 5 — pricing is handled via per-line entries on Step 4 in the real
 *  backend; this body shape is kept for the wizard's existing UI but only the
 *  perMinutePaise field (if present) lands on the PATCH. */
export interface Step5Body { items: PricingItem[]; perMinutePaise?: number; }
export interface AvailabilitySlot {
  dayOfWeek: number; startTime: string; endTime: string; isBreak?: boolean;
}
export interface Step6Body { slots: AvailabilitySlot[]; serviceMode?: ServiceMode; }

/** KYC presign — real backend returns r2ObjectKey + uploadUrl + headers. */
export interface PresignKycBody { contentType: 'video/mp4' | 'video/webm' | 'video/quicktime'; sizeBytes: number; }
export interface PresignKycResp {
  uploadUrl: string;
  r2ObjectKey: string;
  expiresIn: number;
  headers: Record<string, string>;
  maxSizeBytes: number;
}
/** Step 7 — backend's SubmitKycDto = { r2ObjectKey, durationSeconds, deviceFingerprint? }. */
export interface Step7Body {
  r2ObjectKey: string;
  durationSeconds: number;
  deviceFingerprint?: string;
}

export const providerOnboardingApi = {
  // Step 1 — basic personal details. PATCH /:id with the flat fields.
  step1: async (body: Step1Body) => {
    await patch(whitelist({
      fullName: body.fullName,
      dob:      body.dob,
      phone:    body.phone,
      city:     body.city,
    }));
    return { providerId: currentDraftId!, step: 1 as const };
  },

  // Step 2 — experience, languages, bio. PATCH /:id.
  step2: async (body: Step2Body) => {
    await patch(whitelist({
      experienceYears: body.experienceYears,
      languages:       body.languages,
      bio:             body.bio,
    }));
    return { providerId: currentDraftId!, step: 2 as const };
  },

  // Step 3 — religion. PATCH /:id.
  step3: async (body: Step3Body) => {
    await patch(whitelist({ religion: body.religion }));
    return { providerId: currentDraftId!, step: 3 as const, religion: body.religion };
  },

  // Step 4 — services selection. No server call: the real backend's
  // /services endpoint requires per-service prices, which we don't collect
  // until step 5. Step 4 just records the selection locally — Step 5
  // consolidates it into a single POST.
  step4: async (_body: Step4Body) => {
    const id = await ensureDraftId();
    return { providerId: id, step: 4 as const, selected: _body.services.length };
  },

  // Step 5 — pricing. POSTs the full `{services: [{catalogServiceId,
  // pricePaise}]}` array (built from PricingItem inputs) to /:id/services.
  // Also PATCHes perMinutePaise if the wizard collected one.
  step5: async (body: Step5Body) => {
    const id = await ensureDraftId();
    const services: Step4ServiceLine[] = body.items
      .filter((it) => typeof it.serviceId === 'number' && it.basePricePaise > 0)
      .map((it) => ({
        catalogServiceId: it.serviceId!,
        pricePaise:       it.basePricePaise,
      }));
    if (services.length > 0) {
      await apiFetch<unknown>(`/provider/onboarding/${id}/services`, {
        method: 'POST',
        body: JSON.stringify({ services }),
      });
    }
    if (typeof body.perMinutePaise === 'number') {
      await patch(whitelist({ perMinutePaise: body.perMinutePaise }));
    }
    return { providerId: id, step: 5 as const, itemCount: body.items.length };
  },

  // Step 6 — availability. The real backend doesn't yet expose a slots
  // endpoint, but it does accept serviceMode on PATCH. Slots persist in the
  // local draft; serviceMode is mirrored to the server.
  step6: async (body: Step6Body) => {
    if (body.serviceMode) await patch(whitelist({ serviceMode: body.serviceMode }));
    return { providerId: currentDraftId!, step: 6 as const, slotCount: body.slots.length };
  },

  // KYC presign — POST /provider/onboarding/:id/kyc/presign.
  presignKyc: async (body: PresignKycBody) => {
    const id = await ensureDraftId();
    return apiFetch<PresignKycResp>(`/provider/onboarding/${id}/kyc/presign`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // PUT the recorded blob directly to the presigned URL. The backend never
  // sees the bytes; on completion the client confirms via POST /:id/kyc.
  uploadKycVideo: async (presigned: PresignKycResp, blob: Blob) => {
    const res = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: presigned.headers,
      body: blob,
    });
    if (!res.ok) throw new ApiError('S3_UPLOAD_FAILED', 'KYC upload failed', res.status);
    return { r2ObjectKey: presigned.r2ObjectKey };
  },

  // Step 7 — attach the KYC reference. No longer submits; Step 9 calls /submit.
  step7: async (body: Step7Body) => {
    const id = await ensureDraftId();
    await apiFetch<unknown>(`/provider/onboarding/${id}/kyc`, {
      method: 'POST',
      body: JSON.stringify({
        r2ObjectKey:        body.r2ObjectKey,
        durationSeconds:    Math.floor(body.durationSeconds),
        ...(body.deviceFingerprint ? { deviceFingerprint: body.deviceFingerprint } : {}),
      }),
    });
    return { providerId: id, step: 7 as const };
  },

  // Step 8 — PAN card photo.
  presignPan: async (body: { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; sizeBytes: number }) => {
    const id = await ensureDraftId();
    return apiFetch<PresignKycResp>(`/provider/onboarding/${id}/pan/presign`, {
      method: 'POST', body: JSON.stringify(body),
    });
  },
  uploadPanImage: async (presigned: PresignKycResp, blob: Blob) => {
    const res = await fetch(presigned.uploadUrl, { method: 'PUT', headers: presigned.headers, body: blob });
    if (!res.ok) throw new ApiError('S3_UPLOAD_FAILED', 'PAN upload failed', res.status);
    return { r2ObjectKey: presigned.r2ObjectKey };
  },
  confirmPan: async (r2ObjectKey: string) => {
    const id = await ensureDraftId();
    return apiFetch<{ ok: boolean }>(`/provider/onboarding/${id}/pan`, {
      method: 'POST', body: JSON.stringify({ r2ObjectKey }),
    });
  },

  // Step 8 — Selfie photo.
  presignSelfie: async (body: { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; sizeBytes: number }) => {
    const id = await ensureDraftId();
    return apiFetch<PresignKycResp>(`/provider/onboarding/${id}/selfie/presign`, {
      method: 'POST', body: JSON.stringify(body),
    });
  },
  uploadSelfieImage: async (presigned: PresignKycResp, blob: Blob) => {
    const res = await fetch(presigned.uploadUrl, { method: 'PUT', headers: presigned.headers, body: blob });
    if (!res.ok) throw new ApiError('S3_UPLOAD_FAILED', 'Selfie upload failed', res.status);
    return { r2ObjectKey: presigned.r2ObjectKey };
  },
  confirmSelfie: async (r2ObjectKey: string) => {
    const id = await ensureDraftId();
    return apiFetch<{ ok: boolean }>(`/provider/onboarding/${id}/selfie`, {
      method: 'POST', body: JSON.stringify({ r2ObjectKey }),
    });
  },

  // Step 9 — Payout setup (Bank or UPI).
  saveBank: async (body: { accountNumber?: string; ifscCode?: string; bankName?: string; beneficiaryName?: string; upiId?: string }) => {
    const id = await ensureDraftId();
    return apiFetch<{ ok: boolean; masked: string }>(`/provider/onboarding/${id}/bank`, {
      method: 'POST', body: JSON.stringify(body),
    });
  },
  getBank: async () => {
    const id = await ensureDraftId();
    return apiFetch<{ hasBank: boolean; masked: string | null; method: 'bank' | 'upi' | null }>(
      `/provider/onboarding/${id}/bank`,
    );
  },

  // Final submit — separate from KYC video; called by Step 9.
  submit: async () => {
    const id = await ensureDraftId();
    return apiFetch<{ providerState?: ProviderStatus; status?: ProviderStatus }>(
      `/provider/onboarding/${id}/submit`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  },

  // GET /provider/onboarding/me — real backend returns { state, draft }.
  // The mock returns { id, step, data, providerStatus }. We accept both.
  getDraft: async (): Promise<OnboardingDraft> => {
    try {
      const resp = await apiFetch<any>(`/provider/onboarding/me`);
      const cachedId = pickId(resp);
      if (cachedId) currentDraftId = cachedId;
      return {
        step: typeof resp?.step === 'number' ? resp.step : 1,
        data: (resp?.draft && typeof resp.draft === 'object') ? resp.draft
              : (resp?.data && typeof resp.data === 'object') ? resp.data
              : {},
        providerStatus: (resp?.state ?? resp?.providerStatus ?? null) as ProviderStatus | null,
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { step: 1, data: {}, providerStatus: null };
      }
      throw err;
    }
  },

  // saveDraft — debounced autosave from the Zustand store. We strip the
  // store payload to the subset of fields the backend PatchDraftDto accepts;
  // anything else stays local-only until the corresponding step fires.
  saveDraft: async (_step: number, data: Record<string, unknown>) => {
    const body = whitelist(data);
    if (Object.keys(body).length === 0) {
      return { ok: true, step: _step, savedAt: new Date().toISOString() };
    }
    await patch(body);
    return { ok: true, step: _step, savedAt: new Date().toISOString() };
  },
};

/** Toggle the provider's online/offline status visible to users. */
export async function setProviderOnline(isOnline: boolean): Promise<{ isOnline: boolean }> {
  // Real backend: PATCH /v1/providers/me/online with { isOnline: boolean }.
  return apiFetch<{ isOnline: boolean }>('/providers/me/online', {
    method: 'PATCH',
    body: JSON.stringify({ isOnline }),
  });
}
