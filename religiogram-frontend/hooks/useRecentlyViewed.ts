'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Temple } from '@/lib/temples-api';

/**
 * Recently viewed temples — client-side retention loop.
 *
 * Why a hook (and not a Context provider)?
 *   - The data is strictly per-browser and never synced server-side, so
 *     there's no benefit to hoisting a Provider above the tree. Each
 *     consumer that needs it subscribes via the hook, and we broadcast
 *     changes over a `storage`-style custom event so two mounts (e.g. a
 *     detail page and the home strip) stay in sync.
 *   - Keeps this feature completely removable if it ever gets replaced
 *     by a backend-synced "history" endpoint: delete the hook + any
 *     call-sites, and the rest of the app is unaffected.
 *
 * Storage shape
 * -------------
 *   localStorage key:  "religiogram.recentTemples"
 *   Value:             JSON-serialised array of {id, name, city, imageUrl,
 *                      viewedAt} — trimmed to the 10 most-recent entries.
 *
 *   We snapshot a minimal subset of the Temple instead of the whole
 *   object so a schema change on the backend (e.g. adding a big field)
 *   doesn't bloat every user's localStorage. If we need more fields on
 *   the Home strip later, we widen the snapshot intentionally.
 *
 *   A versioned key prefix ("v1") is embedded so we can migrate without
 *   a broken-layout flash — bumping to v2 just makes old entries invisible.
 */
const STORAGE_KEY = 'religiogram.recentTemples.v1';
const MAX_ITEMS = 10;
const CHANGE_EVENT = 'religiogram:recent-temples-changed';

/** The minimal temple snapshot we persist — see rationale above. */
export interface RecentTemple {
  id: string;
  name: string;
  city: string;
  imageUrl: string | null;
  viewedAt: number; // epoch ms, for sort + "N hours ago" labels if we add them
}

function readStorage(): RecentTemple[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop entries that don't have the required fields.
    return parsed.filter(
      (e): e is RecentTemple =>
        e &&
        typeof e.id === 'string' &&
        typeof e.name === 'string' &&
        typeof e.city === 'string' &&
        typeof e.viewedAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeStorage(list: RecentTemple[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    // Notify other hook instances in the same tab. The native `storage`
    // event only fires across tabs, not within the same one, so we need
    // our own broadcast for intra-tab sync.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* quota exceeded / private mode — silently degrade */
  }
}

/**
 * Subscribe to the recently-viewed list and get helpers to mutate it.
 *
 * Hydration safety: on the first render (SSR / static export) `items` is
 * always `[]`. The effect below populates it once on the client to avoid
 * a hydration mismatch. Call sites should treat the initial empty array
 * as "not ready yet, render nothing" when appropriate.
 */
export function useRecentlyViewed(): {
  items: RecentTemple[];
  isHydrated: boolean;
  record: (t: Temple) => void;
  remove: (id: string) => void;
  clear: () => void;
} {
  const [items, setItems] = useState<RecentTemple[]>([]);
  const [isHydrated, setHydrated] = useState(false);

  /** Initial load + cross-tab / same-tab sync. */
  useEffect(() => {
    setItems(readStorage());
    setHydrated(true);

    const onChange = () => setItems(readStorage());
    window.addEventListener(CHANGE_EVENT, onChange);
    // `storage` event fires only for other tabs — useful for multi-tab users.
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  /**
   * Push a temple to the top of the list. If it was already in the list
   * we remove the old entry first so the order reflects true recency —
   * the way every well-behaved "recently used" list does.
   */
  const record = useCallback((t: Temple) => {
    const snapshot: RecentTemple = {
      id: t.id,
      name: t.name,
      city: t.city,
      imageUrl: t.imageUrl,
      viewedAt: Date.now(),
    };
    const current = readStorage();
    const deduped = current.filter((e) => e.id !== t.id);
    const next = [snapshot, ...deduped].slice(0, MAX_ITEMS);
    writeStorage(next);
    setItems(next);
  }, []);

  const remove = useCallback((id: string) => {
    const next = readStorage().filter((e) => e.id !== id);
    writeStorage(next);
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    setItems([]);
  }, []);

  return { items, isHydrated, record, remove, clear };
}
