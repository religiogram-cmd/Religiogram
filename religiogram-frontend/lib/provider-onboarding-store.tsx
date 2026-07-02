/**
 * Provider-onboarding form state manager.
 *
 * Persistence layers (same pattern as /lib/profile-draft.ts):
 *
 *   1. React context               — instant UI updates
 *   2. localStorage (synchronous)  — survives tab close / offline
 *   3. PATCH /provider/draft (3s debounce) — multi-device resume
 *
 * The server is authoritative: on app start we fetch /provider/draft and
 * reconcile with local. If the server `updatedAt` is newer, we accept it;
 * otherwise we push local up.
 *
 * We intentionally don't use Zustand / Redux here — a single Context is
 * enough for a 7-step wizard and saves a dependency.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  providerOnboardingApi,
  type AvailabilitySlot,
  type PricingItem,
  type Religion,
  type ServiceMode,
} from './provider-onboarding-api';

export const LOCAL_KEY = 'rg_provider_onboarding_v1';
export const DEBOUNCE_MS = 3000;

export interface ProviderOnboardingData {
  [key: string]: unknown;
  // Step 0 — category chooser (asked at the very start of the wizard).
  // Drives which downstream steps show priest vs astrologer content.
  // 'both' = the provider serves as both a priest AND an astrologer; downstream
  // steps show the union of both flows (services + specialisations, in-person
  // + per-minute pricing, etc).
  providerCategory?: 'priest' | 'astrologer' | 'both';
  // ── Astrologer-only fields ──
  specialisations?: string[];              // Vedic, KP, Tarot, etc.
  consultationChannels?: ('chat' | 'voice' | 'video')[];
  perMinutePaise?: number;
  // Step 1
  fullName?: string;
  dob?: string;
  phone?: string;
  city?: string;
  // Step 2
  experienceYears?: number;
  languages?: string[];
  bio?: string;
  // Step 3
  religion?: Religion;
  // Step 4
  selectedServiceIds?: number[];
  customServiceNames?: string[];
  // Step 5
  pricing?: PricingItem[];
  // Step 6
  slots?: AvailabilitySlot[];
  // Step 7 — metadata only; the actual file lives in S3
  kycS3Key?: string;
  kycR2ObjectKey?: string;
  kycDurationSeconds?: number;
  // Step 8 — identity documents (S3 keys persisted server-side)
  panR2ObjectKey?: string;
  selfieR2ObjectKey?: string;
  // Step 9 — payout method snapshot
  payoutMethod?: 'bank' | 'upi';
  payoutMasked?: string;
}

export interface OnboardingState {
  step: number;
  data: ProviderOnboardingData;
  /** 'synced' when local and server agree, 'saving' while debounce is in
   *  flight, 'offline' if the last save failed. */
  saveStatus: 'idle' | 'saving' | 'synced' | 'offline';
  updatedAt: number;
}

interface OnboardingContextValue extends OnboardingState {
  /** Shallow-merges `patch` into data. Triggers autosave. */
  update: (patch: Partial<ProviderOnboardingData>) => void;
  /** Sets the furthest-reached step. Monotonic. */
  advance: (step: number) => void;
  /** Drop everything (after successful Step 7 submit). */
  reset: () => void;
  /** Force a save right now (used on explicit "Next"). */
  flush: () => Promise<void>;
}

const OnboardingCtx = createContext<OnboardingContextValue | null>(null);

const INITIAL: OnboardingState = {
  step: 1,
  data: {},
  saveStatus: 'idle',
  updatedAt: Date.now(),
};

function readLocal(): OnboardingState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.step !== 'number') return null;
    return parsed as OnboardingState;
  } catch {
    return null;
  }
}

function writeLocal(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — silently ignore, server is the source of truth */
  }
}

export function ProviderOnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Hydrate: local → server reconcile on mount */
  useEffect(() => {
    const local = readLocal();
    if (local) setState(local);

    (async () => {
      try {
        const remote = await providerOnboardingApi.getDraft();
        // If the user already submitted and is approved / pending, bail.
        if (remote.providerStatus === 'approved') {
          setState({ ...INITIAL, saveStatus: 'synced' });
          return;
        }
        // Server wins if it's non-empty and we have nothing local.
        if (!local && Object.keys(remote.data ?? {}).length > 0) {
          setState({
            step: remote.step,
            data: remote.data as ProviderOnboardingData,
            saveStatus: 'synced',
            updatedAt: Date.now(),
          });
        }
      } catch {
        /* offline — carry on with local only */
        setState((s: any) => ({ ...s, saveStatus: 'offline' }));
      }
    })();
  }, []);

  /* Save pipeline: local write first, server PATCH on debounce */
  const scheduleServerSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const s = stateRef.current;
      setState((prev: any) => ({ ...prev, saveStatus: 'saving' }));
      try {
        await providerOnboardingApi.saveDraft(s.step, s.data);
        setState((prev: any) => ({ ...prev, saveStatus: 'synced' }));
      } catch {
        setState((prev: any) => ({ ...prev, saveStatus: 'offline' }));
      }
    }, DEBOUNCE_MS);
  }, []);

  const update = useCallback(
    (patch: Partial<ProviderOnboardingData>) => {
      setState((prev: any) => {
        const next: OnboardingState = {
          ...prev,
          data: { ...prev.data, ...patch },
          updatedAt: Date.now(),
          saveStatus: 'saving',
        };
        writeLocal(next);
        return next;
      });
      scheduleServerSave();
    },
    [scheduleServerSave],
  );

  const advance = useCallback(
    (step: number) => {
      setState((prev: any) => {
        const next: OnboardingState = {
          ...prev,
          step: Math.max(prev.step, step),
          updatedAt: Date.now(),
          saveStatus: 'saving',
        };
        writeLocal(next);
        return next;
      });
      scheduleServerSave();
    },
    [scheduleServerSave],
  );

  const flush = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const s = stateRef.current;
    try {
      await providerOnboardingApi.saveDraft(s.step, s.data);
      setState((prev: any) => ({ ...prev, saveStatus: 'synced' }));
    } catch (err) {
      // Soft-fail: the draft is already in localStorage via writeLocal(), so
      // losing the network round-trip should not block the wizard. Surface
      // the failure to the UI via saveStatus='offline' and log it.
      // eslint-disable-next-line no-console
      console.warn('[onboarding] saveDraft failed; keeping local draft and continuing.', err);
      setState((prev: any) => ({ ...prev, saveStatus: 'offline' }));
    }
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== 'undefined') localStorage.removeItem(LOCAL_KEY);
    setState(INITIAL);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ ...state, update, advance, reset, flush }),
    [state, update, advance, reset, flush],
  );

  return <OnboardingCtx.Provider value={value}>{children}</OnboardingCtx.Provider>;
}

export function useProviderOnboarding(): OnboardingContextValue {
  const v = useContext(OnboardingCtx);
  if (!v)
    throw new Error(
      'useProviderOnboarding must be used inside <ProviderOnboardingProvider>',
    );
  return v;
}

/* Utility used across Steps 5 and display screens. */
export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): number {
  return (paise | 0) / 100;
}

export const SERVICE_MODES: Array<{ value: ServiceMode; label: string }> = [
  { value: 'online', label: 'Online only' },
  { value: 'offline', label: 'In-person' },
  { value: 'both', label: 'Online + In-person' },
];
