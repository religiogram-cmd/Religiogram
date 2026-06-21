'use client';

/**
 * PwaInit — mounts in the root layout and handles:
 *   1. Service worker registration (production only).
 *   2. Service worker UNregistration + cache wipe in dev — prevents stale
 *      _next chunk interception that broke local development on rebuilds.
 *
 * The PWA "Add to Home Screen" install banner has been disabled per product
 * decision. The `beforeinstallprompt` event is intentionally NOT captured so
 * the browser will still expose its own native install affordance when the
 * site meets PWA install criteria — we just no longer render our custom card.
 *
 * This component renders null — zero visual footprint, always.
 */

import { useEffect } from 'react';

export default function PwaInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // In dev we proactively kill any registered SW + its caches. A stale SW
    // intercepting /_next/static/chunks/* returns 404s and breaks the entire
    // app on every rebuild.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          r.unregister().then((ok) => {
            if (ok) console.info('[SW] Dev mode — unregistered stale SW:', r.scope);
          });
        });
        if (typeof caches !== 'undefined') {
          caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
        }
      });
      return;
    }

    // Production: register the real SW for offline + push capability.
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);
        // Force update check on every page load so new deploys land within
        // one refresh instead of waiting for the SW idle timer.
        reg.update().catch(() => {});
        // When a new SW takes control, reload the page so the user sees
        // the freshly deployed HTML/JS without manually clearing cache.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // Tell the new SW to take control immediately.
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  }, []);

  return null;
}
