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

const BREAKPOINT = '768px';     // mobile vs desktop cutoff

// "page" — wide, website-like container (1120px) with NO visible box.
//          Best for app pages with grids, hero images, multi-column content.
// "narrow" — 480px centered phone-like column WITH soft shadow + border.
//          Best for single-purpose forms (sign-in, sign-up).
type Variant = 'page' | 'narrow';

const WIDTHS: Record<Variant, number> = {
  page:   1120,
  narrow: 480,
};

export default function MobileAppFrame({
  children,
  variant = 'page',
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const max = WIDTHS[variant];
  const showBox = variant === 'narrow';
  return (
    <>
      {/* Inline style block — keeps the wrapper portable across pages without
          coupling to Tailwind. Scoped via clear class names. */}
      <style>{`
        /* Default (mobile) — backdrop hidden, app fills viewport */
        .rg-app-backdrop { display: none; }
        .rg-app-frame    { width: 100%; min-height: 100svh; position: relative; }

        @media (min-width: ${BREAKPOINT}) {
          /* Desktop / large tablet — centre the content. Backdrop is a soft
             cream that matches the app's own background so the frame feels
             like a natural page boundary, not a card floating in a room. */
          body { background: #FDF6E3; }
          .rg-app-backdrop {
            display: block;
            position: fixed; inset: 0;
            background:
              radial-gradient(900px 600px at 50% -120px, rgba(200,146,10,0.10), transparent 60%),
              linear-gradient(180deg, #FDF6E3 0%, #F4EAC8 100%);
            z-index: 0;
            pointer-events: none;
          }
          .rg-app-frame {
            position: relative; z-index: 1;
            max-width: ${max}px;
            margin: 0 auto;
            min-height: 100svh;
            background: #FDF6E3;
            overflow: visible;
            ${showBox ? `
              box-shadow:
                0 24px 60px -22px rgba(15,36,82,0.18),
                0 0 0 1px rgba(200,146,10,0.18);
              border-radius: 0;
            ` : ''}
          }

          /* Constrain the fixed bottom nav to the same column. The nav uses
             this class — set on its outer <nav> in BottomNav.tsx. */
          .rg-bottom-nav {
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%);
            max-width: ${max}px;
            width: 100%;
          }
        }
      `}</style>

      <div className="rg-app-backdrop" aria-hidden="true" />
      <div className="rg-app-frame">{children}</div>
    </>
  );
}
