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
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  }, []);

  return null;
}
