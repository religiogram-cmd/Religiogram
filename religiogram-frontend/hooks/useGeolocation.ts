'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Browser Geolocation state with explicit, user-facing status.
 *
 * The native Geolocation API has three surfaces we care about:
 *   - Permissions API (`navigator.permissions.query`) — for observing
 *     prior grants without triggering a new prompt. Some mobile browsers
 *     (older Safari, in-app webviews) don't implement this — we gracefully
 *     fall back to direct getCurrentPosition.
 *   - getCurrentPosition — actually asks. MUST be called from a user-
 *     gesture handler on iOS Safari or it silently fails with PERMISSION_DENIED.
 *   - watchPosition — not used here; discovery doesn't need live updates.
 *
 * `status` transitions:
 *   idle        — haven't asked yet, no cached grant
 *   prompt      — permission is 'prompt' — user hasn't decided
 *   requesting  — we called getCurrentPosition, waiting for OS dialog
 *   granted     — coords are populated
 *   denied      — user said no, or revoked in browser settings
 *   unavailable — browser has no geolocation support at all
 */
export type GeoStatus =
  | 'idle'
  | 'prompt'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface Coords {
  lat: number;
  lng: number;
  accuracyMetres: number;
}

interface UseGeolocationResult {
  status: GeoStatus;
  coords: Coords | null;
  error: string | null;
  /** Trigger the permission prompt. Must be called from a user gesture. */
  request: () => Promise<void>;
}

/**
 * Cache the most recent successful reading on the session so a soft-reload
 * inside the app doesn't re-prompt the user. sessionStorage (not localStorage)
 * because we want to re-check every tab open to catch revoked permissions.
 */
const COORDS_CACHE_KEY = 'rg_geo_coords';

function readCachedCoords(): Coords | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(COORDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Coords;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.accuracyMetres === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedCoords(c: Coords): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore — private mode / quota */
  }
}

export function useGeolocation(): UseGeolocationResult {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ── Prime state from cache + Permissions API on mount ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    const cached = readCachedCoords();
    if (cached) {
      setCoords(cached);
      setStatus('granted');
      return;
    }

    // Permissions API is best-effort — some browsers (Safari < 16, webviews)
    // don't support the 'geolocation' descriptor.
    const perms = (navigator as Navigator & {
      permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
    }).permissions;
    if (!perms?.query) {
      setStatus('idle');
      return;
    }

    let mounted = true;
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (!mounted) return;
        if (p.state === 'granted') setStatus('prompt'); // will hydrate after request()
        else if (p.state === 'denied') setStatus('denied');
        else setStatus('prompt');
      })
      .catch(() => {
        if (mounted) setStatus('idle');
      });

    return () => {
      mounted = false;
    };
  }, []);

  /* ── Actually prompt the user ── */
  const request = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setStatus('requesting');
    setError(null);

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: Coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMetres: pos.coords.accuracy ?? 0,
          };
          writeCachedCoords(c);
          setCoords(c);
          setStatus('granted');
          resolve();
        },
        (err) => {
          // GeolocationPositionError.code:
          //   1 PERMISSION_DENIED — user said no, or permissions UI dismissed
          //   2 POSITION_UNAVAILABLE — no GPS/wifi signal
          //   3 TIMEOUT
          if (err.code === 1) {
            setStatus('denied');
            setError(
              'Location permission was denied. You can enable it in your browser settings.',
            );
          } else if (err.code === 2) {
            setStatus('idle');
            setError(
              'We could not determine your location. Please check your connection and try again.',
            );
          } else if (err.code === 3) {
            setStatus('idle');
            setError('Getting your location took too long. Please try again.');
          } else {
            setStatus('idle');
            setError('Unable to get your location right now.');
          }
          resolve();
        },
        {
          enableHighAccuracy: false, // city-level is enough for temple discovery
          maximumAge: 5 * 60 * 1000, // accept up to 5-min-old fixes
          timeout: 15 * 1000,
        },
      );
    });
  }, []);

  return { status, coords, error, request };
}
