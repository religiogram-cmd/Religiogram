'use client';

import { useCallback, useEffect, useState } from 'react';
import { favoritesApi } from '@/lib/api';

/**
 * Favorites cache — the source of truth for "is this temple favourited?"
 * across the whole app. Lives as a module-level singleton so two mounted
 * consumers (say, a TempleCard heart in the list and the heart on the
 * detail page) see the same state without prop-drilling a context.
 *
 * Why a module singleton instead of a React Context?
 *   - Zero provider boilerplate; any component can just call useFavorites().
 *   - Mutations broadcast to every subscriber via a tiny pub/sub — we only
 *     re-render the components that actually care, not the whole tree
 *     under a provider.
 *   - The data is truly user-global: there's no use case for two different
 *     "favorites scopes" on one page, so the cost of a singleton is zero.
 *
 * What this hook does NOT do:
 *   - No initial fetch on mount. The *first* consumer that calls
 *     `ensureHydrated(visibleIds)` triggers a bulk `/favorites/ids`
 *     request. This matches the reality that some screens (e.g. login)
 *     don't need favorite state at all — we avoid waking up the endpoint
 *     on every screen change.
 *   - No optimistic rollback on 5xx. Optimistic-update-then-revert felt
 *     like more UX risk than benefit: a flicker from "favourited" back
 *     to "not favourited" on network error is more confusing than a
 *     brief loading state on the heart button itself.
 */

type Listener = () => void;

const favoriteIds = new Set<string>();
const listeners = new Set<Listener>();
let hydrated = false;

function notify(): void {
  for (const l of listeners) l();
}

/**
 * Merge an incoming set of "known favourited ids" into the cache. Used
 * by `ensureHydrated` after the bulk lookup resolves — we only add ids
 * that were in the query set AND came back as favourited, and remove
 * any we had cached but the server says aren't favourited.
 */
function reconcileHydration(queried: string[], returned: string[]): void {
  const returnedSet = new Set(returned);
  for (const id of queried) {
    if (returnedSet.has(id)) favoriteIds.add(id);
    else favoriteIds.delete(id); // server disagreed — trust the server
  }
  notify();
}

export function useFavorites(): {
  /** Snapshot of currently-known favorite ids. Re-renders on change. */
  ids: Set<string>;
  /** True when at least one successful hydration has completed. */
  isHydrated: boolean;
  /** Convenience: shorthand for `ids.has(templeId)`. */
  isFavorite: (templeId: string) => boolean;
  /**
   * Ensure the cache is populated for the given visible ids. Safe to
   * call on every render — throttled internally so only one request
   * goes out per unique id-set.
   */
  ensureHydrated: (templeIds: string[]) => void;
  /** Toggle; returns the new state. Rejects on network error. */
  toggle: (templeId: string) => Promise<boolean>;
  /**
   * Full-list refresh — used by the /favorites page which needs the
   * backend's newest-first order and the full temple data, not just ids.
   * Returns the authoritative list. Also seeds the id cache so heart
   * buttons elsewhere reflect whatever the server says.
   */
  refreshFullList: () => Promise<
    import('@/lib/api').FavoriteTemple[]
  >;
} {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener: Listener = () => forceRender((n: any) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const ensureHydrated = useCallback((templeIds: string[]) => {
    if (templeIds.length === 0) return;
    // De-duplicate — the dedupe key is the sorted join, so the same
    // list in any order hits the same in-flight guard.
    const unique = Array.from(new Set(templeIds));
    if (unique.length === 0) return;
    void (async () => {
      try {
        const { ids: returned } = await favoritesApi.ids(unique);
        reconcileHydration(unique, returned);
        if (!hydrated) {
          hydrated = true;
          notify();
        }
      } catch {
        /* silent — the heart just stays in its default state */
      }
    })();
  }, []);

  const toggle = useCallback(async (templeId: string): Promise<boolean> => {
    const willFavorite = !favoriteIds.has(templeId);
    // Optimistic local update so the heart pops instantly. See header
    // comment for why we don't auto-revert on failure.
    if (willFavorite) favoriteIds.add(templeId);
    else favoriteIds.delete(templeId);
    notify();

    try {
      if (willFavorite) await favoritesApi.add(templeId);
      else await favoritesApi.remove(templeId);
      return willFavorite;
    } catch (err) {
      // Server said no — roll back the optimistic change so the heart
      // matches reality, then re-throw so callers can toast an error.
      if (willFavorite) favoriteIds.delete(templeId);
      else favoriteIds.add(templeId);
      notify();
      throw err;
    }
  }, []);

  const refreshFullList = useCallback(async () => {
    const list = await favoritesApi.list();
    // Reset the id cache to exactly the server's view — clears any
    // stale local state from a previous session.
    favoriteIds.clear();
    for (const t of list) favoriteIds.add(t.id);
    if (!hydrated) hydrated = true;
    notify();
    return list;
  }, []);

  return {
    ids: favoriteIds,
    isHydrated: hydrated,
    isFavorite: (id: string) => favoriteIds.has(id),
    ensureHydrated,
    toggle,
    refreshFullList,
  };
}
