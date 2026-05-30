/// <reference types="@types/google.maps" />
'use client';

import { useEffect, useState } from 'react';

/**
 * Lazy-load the Google Maps JS SDK (with places + geocoding libraries) once
 * per tab, sharing a single in-flight load promise across every hook caller.
 *
 * Why do it ourselves instead of a package like `@googlemaps/js-api-loader`?
 *   - Zero deps, zero bundle cost for screens that never open the map.
 *   - Strict de-duplication: many components calling this at once still
 *     results in exactly one <script> tag appended.
 *   - We can gate on NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and surface a clean
 *     error to dev if someone forgot to set it.
 *
 * IMPORTANT: we load the `places` library to get AutocompleteService
 * (for Place predictions — cheap, session-billed) and the `marker` library
 * so we can render advanced markers without a second network round-trip.
 * We do NOT use Place Details API — that's an expensive per-call billed
 * endpoint. The flow is:
 *     AutocompleteService → prediction.place_id
 *       → Geocoder.geocode({ placeId }) → lat/lng
 *   which uses the cheap geocoding quota instead.
 */

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'missing-key';

declare global {
  interface Window {
    google?: typeof google;
    __rgMapsPromise?: Promise<void>;
  }
}

const SCRIPT_ID = 'rg-google-maps-sdk';

function buildSrc(key: string): string {
  const params = new URLSearchParams({
    key,
    libraries: 'places,marker,geometry',
    loading: 'async',
    v: 'weekly',
    // callback is required even when we use the promise pattern — Google
    // calls it once the script finishes evaluating.
    callback: '__rgMapsInit',
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function loadScript(key: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is not available'));
  }
  if (window.google?.maps) return Promise.resolve();
  if (window.__rgMapsPromise) return window.__rgMapsPromise;

  window.__rgMapsPromise = new Promise<void>((resolve, reject) => {
    const resolveOnce = () => resolve();
    // Google's `callback=` param expects a global function.
    (window as unknown as Record<string, unknown>)['__rgMapsInit'] = resolveOnce;

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // If someone inserted the tag but we haven't seen the callback yet,
      // attach load/error hooks as a fallback.
      existing.addEventListener('load', resolveOnce);
      existing.addEventListener('error', () => reject(new Error('maps script failed')));
      return;
    }

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src = buildSrc(key);
    s.addEventListener('error', () => reject(new Error('maps script failed')));
    document.head.appendChild(s);
  });

  return window.__rgMapsPromise;
}

export interface UseGoogleMapsResult {
  status: LoadStatus;
  google: typeof google | null;
  error: string | null;
}

/**
 * Usage:
 *   const { status, google } = useGoogleMaps();
 *   if (status !== 'ready' || !google) return <MapSkeleton />;
 */
export function useGoogleMaps(): UseGoogleMapsResult {
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('missing-key');
      setError(
        'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Map features will be disabled.',
      );
      return;
    }

    if (window.google?.maps) {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    loadScript(key)
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(err?.message ?? 'Failed to load Google Maps.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    status,
    google: status === 'ready' && typeof window !== 'undefined' ? window.google ?? null : null,
    error,
  };
}
