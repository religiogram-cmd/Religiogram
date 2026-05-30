'use client';
import { useState, useEffect } from 'react';
import { usersApi } from './api';

export type UserReligion = 'all' | 'hindu' | 'muslim' | 'sikh' | 'christian';

const STORAGE_KEY = 'rg_user_religion';

export function useReligion() {
  const [religion, setReligionState] = useState<UserReligion | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage first for snappy UI, then reconcile against
    // the server's stored value if the user is authenticated. Server wins
    // on conflict so a different device / fresh install always shows the
    // canonical choice.
    let cached: UserReligion | null = null;
    try {
      cached = localStorage.getItem(STORAGE_KEY) as UserReligion | null;
    } catch { /* SSR guard */ }
    if (cached) setReligionState(cached);

    let cancelled = false;
    usersApi.me()
      .then((u: any) => {
        if (cancelled) return;
        const server = (u?.faith ?? null) as UserReligion | null;
        if (server && server !== cached) {
          try { localStorage.setItem(STORAGE_KEY, server); } catch { /* ignore */ }
          setReligionState(server);
        }
      })
      .catch(() => { /* not signed in — keep cached */ })
      .finally(() => { if (!cancelled) setLoaded(true); });

    if (!cached) setLoaded(true);
    return () => { cancelled = true; };
  }, []);

  const confirmReligion = (r: UserReligion) => {
    try { localStorage.setItem(STORAGE_KEY, r); } catch { /* ignore */ }
    setReligionState(r);
    // Persist to the server so the choice survives logout / device swap.
    // Failure is non-fatal — the local cache stays authoritative until the
    // next successful round-trip.
    usersApi.updateProfile({ faith: r } as any).catch(() => { /* offline */ });
  };

  const resetReligion = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setReligionState(null);
  };

  return { religion, confirmReligion, resetReligion, loaded };
}
