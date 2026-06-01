/**
 * Analytics — fire-and-forget event beacon.
 *
 * Sends `POST /analytics/event` in the background. Callers don't
 * await and don't need to handle errors. A failure is logged to the
 * console at `debug` level only — analytics must never break UX.
 *
 * Event types (mirrors the backend allowlist)
 * -------------------------------------------
 *   - search_query         → temple search typed by the user
 *   - temple_click         → a specific temple card / pin was opened
 *   - city_selected        → user picked a city from the modal / chips
 *   - tab_switch           → local ↔ all-india
 *   - location_permission  → prompt result (granted / denied)
 *   - notification_permission → prompt result
 *
 * PII discipline
 * --------------
 *   Don't stuff names, phone numbers, emails, or other identifiers into
 *   `metadata`. The backend strips a known-forbidden list defensively,
 *   but clean payloads here keep log reviews simple.
 */

import { tokenStore, ApiError } from './api';

const DEFAULT_API_BASE = 'https://api.religiogram.com/api/v1';
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/api/v1'
    : DEFAULT_API_BASE);

export type AnalyticsEventType =
  | 'search_query'
  | 'temple_click'
  | 'city_selected'
  | 'tab_switch'
  | 'location_permission'
  | 'notification_permission'
  // Retention loop: `favorite_toggle` is the single most important
  // product-health signal for v1. A user who favourites ≥ 1 temple
  // is ~4× more likely to return in week-2 (industry baseline for
  // bookmark-style retention). Track source to see which surfaces
  // drive saves (card heart vs. hero heart vs. search result).
  | 'favorite_toggle'
  // Moderation — how often does content get flagged, how fast does
  // admin resolve it? `report_submitted` fires from the user modal;
  // `report_resolved` is dispatched server-side on approve/reject.
  | 'report_submitted'
  | 'report_resolved'
  // Location Intelligence — discovery value of the "Nearby places"
  // strip under the profile. `nearby_viewed` = section hit viewport;
  // `nearby_clicked` = user tapped a card.
  | 'nearby_viewed'
  | 'nearby_clicked';

export interface AnalyticsPayload {
  eventType: AnalyticsEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Fire an event. Never rejects — errors are swallowed after a debug log.
 *
 * Uses `keepalive: true` so the request is allowed to outlive a page
 * navigation (same behaviour `navigator.sendBeacon` provides, without
 * giving up our JSON content-type + auth header).
 */
export function track(payload: AnalyticsPayload): void {
  // Skip on the server — analytics is a client concern.
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    eventType: payload.eventType,
    metadata: payload.metadata ?? {},
    clientTs: new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  // Deliberately no await — caller should not block on beacon delivery.
  // We return void and handle the failure quietly.
  void fetch(`${API_BASE}/analytics/event`, {
    method: 'POST',
    headers,
    body,
    keepalive: true,
  }).catch((err) => {
    // Most failures here are expected (offline, auth expired during
    // background tab, etc.). A `console.debug` keeps this out of the
    // main log stream while still being visible when debugging.
    if (err instanceof ApiError) return;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('analytics beacon failed:', err);
    }
  });
}

/* ── Convenience wrappers (typed helpers) ──────────────────────── */

export const analytics = {
  searchQuery: (q: string, source: 'google' | 'manual') =>
    track({ eventType: 'search_query', metadata: { q: q.slice(0, 120), source } }),

  templeClick: (templeId: string, source: 'list' | 'map' | 'detail') =>
    track({ eventType: 'temple_click', metadata: { templeId, source } }),

  citySelected: (citySlug: string, source: 'modal' | 'chip' | 'settings') =>
    track({ eventType: 'city_selected', metadata: { citySlug, source } }),

  tabSwitch: (to: 'local' | 'all') =>
    track({ eventType: 'tab_switch', metadata: { to } }),

  locationPermission: (result: 'granted' | 'denied' | 'unavailable') =>
    track({ eventType: 'location_permission', metadata: { result } }),

  notificationPermission: (result: 'granted' | 'denied' | 'default' | 'unsupported') =>
    track({ eventType: 'notification_permission', metadata: { result } }),

  favoriteToggle: (templeId: string, favorited: boolean, source: string) =>
    track({
      eventType: 'favorite_toggle',
      metadata: { templeId, favorited, source },
    }),

  reportSubmitted: (
    targetType: string,
    placeId: string,
    targetId: string,
  ) =>
    track({
      eventType: 'report_submitted',
      metadata: { targetType, placeId, targetId },
    }),

  nearbyViewed: (anchorPlaceId: string, count: number) =>
    track({
      eventType: 'nearby_viewed',
      metadata: { anchorPlaceId, count },
    }),

  nearbyClicked: (
    anchorPlaceId: string,
    nearbyPlaceId: string,
    index: number,
  ) =>
    track({
      eventType: 'nearby_clicked',
      metadata: { anchorPlaceId, nearbyPlaceId, index },
    }),
};
