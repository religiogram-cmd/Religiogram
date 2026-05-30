/**
 * Profile-setup draft manager.
 *
 * The wizard saves on every meaningful change so that a user who closes
 * the tab can resume exactly where they were. Two storage layers:
 *
 *   1. localStorage (synchronous, fast, offline-safe)         — primary
 *   2. PATCH /profile (asynchronous, authoritative, multi-device) — secondary
 *
 * We always write local first, then sync to the server in the background.
 * If the server write fails (offline, 5xx) we just leave it in the
 * local-only state; the next successful save flushes the pending diff.
 *
 * The shape is intentionally generic (`Record<string, unknown>`) — the
 * specific fields are owned by the step components. The draft manager
 * just persists whatever they put in.
 */

import { profileApi, ApiError } from '@/lib/api';

const STORAGE_KEY = 'rg_profile_draft_v1';
const DEBOUNCE_MS = 600;

export interface ProfileDraft {
  /** Index of the last step the user reached. Resume lands here. */
  step: number;
  /** Free-form bag of step-owned fields. */
  data: Record<string, unknown>;
  /** Wall-clock of the last local write — used to break ties on resume. */
  updatedAt: number;
  /** True once the wizard's "Finish" button completed end-to-end. */
  completed: boolean;
}

const EMPTY: ProfileDraft = { step: 0, data: {}, updatedAt: 0, completed: false };

/* ─── Local storage helpers ───────────────────────────────────── */
function readLocal(): ProfileDraft {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ProfileDraft>;
    return {
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data as Record<string, unknown> : {},
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      completed: !!parsed.completed,
    };
  } catch {
    // Corrupted JSON — wipe so we don't loop forever.
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return EMPTY;
  }
}

function writeLocal(draft: ProfileDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage disabled — non-fatal. The wizard still
    // works in-memory for the current session.
  }
}

function clearLocal(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ─── Server sync (debounced single-flight) ──────────────────── */
let pending: ProfileDraft | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

async function flushNow(): Promise<void> {
  if (!pending) return;
  const snapshot = pending;
  pending = null;
  try {
    await profileApi.update({
      step: snapshot.step,
      data: snapshot.data,
      completed: snapshot.completed,
    });
  } catch (err) {
    // Re-queue silently on transient failures so the next debounce flushes.
    // Don't re-queue on validation errors (4xx) — they'd loop forever.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      // Drop the snapshot; surface elsewhere if needed.
      return;
    }
    pending = snapshot;
  }
}

function scheduleFlush(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (inflight) {
      // A flush is already running — wait for it before sending the next.
      inflight.finally(() => {
        inflight = flushNow();
      });
      return;
    }
    inflight = flushNow().finally(() => {
      inflight = null;
    });
  }, DEBOUNCE_MS);
}

/* ─── Public API ──────────────────────────────────────────────── */
export const profileDraft = {
  /** Pure read — never throws. */
  load(): ProfileDraft {
    return readLocal();
  },

  /**
   * Write a partial update. Local write is synchronous; server sync is
   * debounced. Returns the merged draft so the caller can re-render.
   */
  save(patch: Partial<Omit<ProfileDraft, 'updatedAt'>>): ProfileDraft {
    const current = readLocal();
    const next: ProfileDraft = {
      step: patch.step ?? current.step,
      data: patch.data ? { ...current.data, ...patch.data } : current.data,
      completed: patch.completed ?? current.completed,
      updatedAt: Date.now(),
    };
    writeLocal(next);
    pending = next;
    scheduleFlush();
    return next;
  },

  /** Mark complete, flush immediately, then drop the local draft. */
  async finalize(finalData?: Record<string, unknown>): Promise<void> {
    const current = readLocal();
    const next: ProfileDraft = {
      step: current.step,
      data: finalData ? { ...current.data, ...finalData } : current.data,
      completed: true,
      updatedAt: Date.now(),
    };
    writeLocal(next);
    pending = next;
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      await flushNow();
    } finally {
      // Always clear local on finalize — even if the server flush failed.
      // The user's session is authoritative; the dashboard will fetch the
      // current profile from /users/me on next load.
      clearLocal();
    }
  },

  /** Discard the draft entirely (e.g. on Skip-and-do-later). */
  reset(): void {
    pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    clearLocal();
  },
};
