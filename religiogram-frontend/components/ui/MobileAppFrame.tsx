'use client';

/**
 * MobileAppFrame
 * --------------
 * Wraps the mobile-first app shell so it looks polished on a desktop monitor
 * without touching any of the existing mobile layouts.
 *
 * Behaviour:
 *   - Mobile  (<768px): renders children full-width — exactly as today.
 *   - Tablet/Desktop (≥768px): centres children in a 480px-wide column with a
 *     navy + gold gradient backdrop filling the rest of the viewport, plus a
 *     soft outer shadow that makes the column look like a phone on a stage.
 *
 * Why this approach
 *   The entire app was designed mobile-first as a PWA. On desktop, every
 *   screen used to stretch edge-to-edge which looked unprofessional. This
 *   wrapper plus a paired BottomNav constraint (`.rg-bottom-nav` class) gives
 *   a phone-on-desktop feel similar to instagram.com / x.com.
 *
 * Notes
 *   - The injected <style> block also constrains `.rg-bottom-nav` so the
 *     fixed-position nav doesn't span the whole viewport on desktop.
 *   - `position: fixed` for the backdrop is intentional — it stays put while
 *     the phone column scrolls.
 */

import type { ReactNode } from 'react';

const FRAME_MAX = 560;          // slightly wider than a phone — reads as a website
const BREAKPOINT = '768px';     // mobile vs desktop cutoff

export default function MobileAppFrame({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Inline style block — keeps the wrapper portable across pages without
          coupling to Tailwind. Scoped via clear class names. */}
      <style>{`
        /* Default (mobile) — backdrop hidden, app fills viewport */
        .rg-app-backdrop { display: none; }
        .rg-app-frame    { width: 100%; min-height: 100svh; position: relative; }

        @media (min-width: ${BREAKPOINT}) {
          /* Desktop / large tablet — show backdrop, centre the column.
             Backdrop is a warm cream tone so the page reads as a centred
             single-column WEBSITE, not "phone screen on a dark wall". */
          body { background: #F6EFDC; }
          .rg-app-backdrop {
            display: block;
            position: fixed; inset: 0;
            background:
              radial-gradient(1100px 700px at 50% -100px, rgba(200,146,10,0.18), transparent 60%),
              radial-gradient(900px  700px at 50% 110%, rgba(200,146,10,0.10), transparent 60%),
              linear-gradient(180deg, #F6EFDC 0%, #EFE3C2 100%);
            z-index: 0;
            pointer-events: none;
          }
          /* Hairline ornament on the backdrop */
          .rg-app-backdrop::after {
            content: '';
            position: absolute; inset: 0;
            background-image: radial-gradient(rgba(200,146,10,0.10) 1px, transparent 1px);
            background-size: 28px 28px;
            opacity: 0.35;
          }
          .rg-app-frame {
            position: relative; z-index: 1;
            max-width: ${FRAME_MAX}px;
            margin: 0 auto;
            min-height: 100svh;
            background: #FDF6E3;
            box-shadow:
              0 24px 60px -22px rgba(15,36,82,0.18),
              0 0 0 1px rgba(200,146,10,0.18);
            overflow: hidden;
          }

          /* Constrain the fixed bottom nav to the same column. The nav uses
             this class — set on its outer <nav> in BottomNav.tsx. */
          .rg-bottom-nav {
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%);
            max-width: ${FRAME_MAX}px;
            width: 100%;
          }
        }
      `}</style>

      <div className="rg-app-backdrop" aria-hidden="true" />
      <div className="rg-app-frame">{children}</div>
    </>
  );
}
