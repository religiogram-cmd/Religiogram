'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';

/**
 * Horizontal "Recently viewed" strip shown above the main results list
 * on the Home screen. Pure client component — reads from the
 * useRecentlyViewed hook (localStorage-backed) and renders nothing until
 * hydration finishes, to avoid a hydration mismatch on first paint.
 *
 * Design choices
 * --------------
 *   - Hidden entirely when empty. No "you haven't viewed any temples yet"
 *     placeholder — it would be visual noise on 100% of first-time visits.
 *   - Horizontal scroll (overflow-x-auto) with snap points so thumb-
 *     scrolling on mobile feels physical. Scrollbar hidden because the
 *     cards themselves imply scroll-affordance.
 *   - Each card links to /temple/[id] rather than dispatching an onClick
 *     — cheaper, gets middle-click and "open in new tab" for free, and
 *     doesn't need analytics here since the detail page already logs
 *     `temple_click` with source='detail' on mount.
 */
export function RecentlyViewedStrip() {
  const { items, isHydrated, clear } = useRecentlyViewed();

  if (!isHydrated) return null;
  if (items.length === 0) return null;

  return (
    <section className="px-5 mb-4" aria-label="Recently viewed temples">
      <div className="flex items-center justify-between mb-2">
        <h2
          className="text-[14px] font-semibold text-[#0F2452]"
          style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
        >
          Recently viewed
        </h2>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] text-gray-700/55 hover:text-gray-700/80"
          aria-label="Clear recently viewed"
        >
          Clear
        </button>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/temple/${t.id}`}
            className="flex-shrink-0 w-[140px] snap-start rounded-2xl overflow-hidden"
            style={{
              background: '#FFFCF5',
              border: '1px solid rgba(197,138,75,.2)',
              boxShadow: '0 2px 8px rgba(61,30,10,.06)',
            }}
          >
            <div
              className="relative w-full aspect-[5/4] overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#C8932A,#0F2452)' }}
            >
              {t.imageUrl ? (
                <Image
                  src={t.imageUrl}
                  alt={t.name}
                  fill
                  sizes="140px"
                  className="object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center text-3xl"
                  style={{ color: '#ffffff' }}
                  aria-hidden
                >
                  🛕
                </div>
              )}
            </div>
            <div className="px-2.5 py-2">
              <p
                className="text-[12.5px] font-semibold text-[#0F2452] leading-tight line-clamp-2"
                title={t.name}
              >
                {t.name}
              </p>
              <p className="text-[11px] text-gray-700/60 mt-0.5 truncate">
                {t.city}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
