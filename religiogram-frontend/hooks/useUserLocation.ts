'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGeolocation, type Coords, type GeoStatus } from './useGeolocation';
import { analytics } from '@/lib/analytics';

/**
 * useUserLocation — product-facing wrapper around `useGeolocation`.
 *
 * Why a second hook?
 *   - `useGeolocation` is the raw browser surface. It caches the last fix
 *     in sessionStorage so a quick nav inside the app doesn't re-prompt,
 *     but it has no concept of "I already asked and the user said no —
 *     stop showing the CTA forever".
 *   - Product wants a soft prompt banner on the place profile. Once the
 *     user dismisses it (or denies the OS prompt), we should not show it
 *     again across sessions — that level of persistence belongs in
 *     localStorage, not sessionStorage.
 *
 * What this hook adds on top of `useGeolocation`:
 *   - `shouldPromptBanner` — convenience flag that combines raw status
 *     with the persisted-dismissed flag, so callers don't re-implement
 *     the logic.
 *   - `dismissPrompt()` — writes the flag so the banner stays hidden.
 *   - Analytics beacons for `location_permission` — fired once per
 *     grant/deny transition so we can measure opt-in rate in prod.
 */

const DISMISSED_KEY = 'rg_loc_prompt_dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (v) window.localStorage.setItem(DISMISSED_KEY, '1');
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* ignore — private mode */
  }
}

export interface UseUserLocationResult {
  status: GeoStatus;
  coords: Coords | null;
  error: string | null;
  /** Trigger the permission prompt. Must be called from a user gesture. */
  request: () => Promise<void>;
  /** Persistently hide the "enable location" CTA. */
  dismissPrompt: () => void;
  /**
   * True when we should show the inline "Show distances — enable
   * location" banner. False when:
   *   - coords are already available (no need)
   *   - user previously denied or dismissed
   *   - the browser has no geolocation support
   */
  shouldPromptBanner: boolean;
}

export function useUserLocation(): UseUserLocationResult {
  const geo = useGeolocation();
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  /* ── One-shot analytics beaconing on permission transitions ──
   *
   * We only emit for terminal states (granted / denied / unavailable),
   * not for every re-render where status stays the same. A ref would be
   * cleaner than an effect guard, but the deduplication is already free
   * because `status` only transitions N times across a session and we
   * want every transition captured once. */
  useEffect(() => {
    if (geo.status === 'granted') {
      analytics.locationPermission('granted');
    } else if (geo.status === 'denied') {
      analytics.locationPermission('denied');
    } else if (geo.status === 'unavailable') {
      analytics.locationPermission('unavailable');
    }
    // intentionally only re-run on status change, not on the beacon itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status]);

  const dismissPrompt = useCallback(() => {
    writeDismissed(true);
    setDismissed(true);
  }, []);

  const shouldPromptBanner =
    !dismissed &&
    geo.status !== 'granted' &&
    geo.status !== 'denied' &&
    geo.status !== 'unavailable' &&
    geo.status !== 'requesting';

  return {
    status: geo.status,
    coords: geo.coords,
    error: geo.error,
    request: geo.request,
    dismissPrompt,
    shouldPromptBanner,
  };
}
