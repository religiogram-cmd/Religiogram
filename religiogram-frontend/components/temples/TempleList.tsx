'use client';

import { useEffect, useRef } from 'react';
import type { Temple } from '@/lib/temples-api';
import { TempleCard } from './TempleCard';

export interface TempleListProps {
  items: Temple[];
  loading: boolean;
  /** Signals a background page-load (additional rows being appended). */
  loadingMore?: boolean;
  error: string | null;
  /** Which card is currently highlighted (from map hover, etc.). */
  activeId: string | null;
  onHover: (id: string | null) => void;
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /**
   * Fired when the end-of-list sentinel scrolls into view. Leave
   * undefined to disable infinite scroll (e.g. the Local tab's single
   * bounded response).
   */
  onLoadMore?: () => void;
  /** Whether more pages exist. When false, the sentinel is not rendered. */
  hasMore?: boolean;
  /** Fires when a card is clicked — lets callers instrument analytics. */
  onCardClick?: (templeId: string) => void;
  /**
   * Optional "try again" handler wired to the error state. When provided
   * the red error banner shows a Retry button that calls this. Leave
   * undefined for call sites where a retry doesn't make sense (e.g. a
   * completely static list fed from props).
   *
   * Auto-retry for transient network failures already happens one level
   * down in `lib/temples-api.ts`; this button is the user-visible escape
   * hatch for the remaining cases (persistent outage, 5xx, validation).
   */
  onRetry?: () => void;
}

/**
 * Renders the temple list. Visual states:
 *   1. loading      → skeletons (shimmer cards)
 *   2. error        → inline error with retry hint
 *   3. items.length → cards (+ optional infinite-scroll sentinel)
 *   4. empty        → friendly empty state with tips
 *
 * Infinite scroll
 * ---------------
 *   A hidden <li> at the bottom acts as an IntersectionObserver sentinel;
 *   when it enters the viewport the parent is asked for the next page.
 *   The sentinel is only mounted when `hasMore` is true — we don't want
 *   the observer firing after the list is exhausted.
 */
export function TempleList({
  items,
  loading,
  loadingMore = false,
  error,
  activeId,
  onHover,
  emptyMessage,
  onLoadMore,
  hasMore = false,
  onCardClick,
  onRetry,
}: TempleListProps) {
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  /* ── IntersectionObserver for the "load more" sentinel. ── */
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            break;
          }
        }
      },
      { rootMargin: '200px 0px' }, // prefetch before the sentinel fully appears
    );
    io.observe(node);
    return () => io.disconnect();
  }, [onLoadMore, hasMore, items.length]);

  if (loading && items.length === 0) {
    return (
      <ul className="space-y-3" aria-busy="true" aria-label="Loading temples">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="rounded-2xl p-4 bg-white/60 animate-pulse" aria-hidden>
            <div className="flex gap-3">
              <div className="w-[68px] h-[68px] rounded-xl bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        role="alert"
      >
        <span className="text-xl" aria-hidden>⚠️</span>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-red-700">Couldn't load temples</p>
          <p className="text-[12px] text-red-600/70 mt-0.5">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 h-8 px-3 rounded-full text-[12px] font-semibold text-white"
              style={{ background: '#0F2452' }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-4xl mb-3" aria-hidden>🛕</span>
        <p className="text-[15px] font-semibold text-[#0F2452]">No temples found</p>
        <p className="text-[13px] text-gray-500 mt-1 max-w-[240px]">
          {emptyMessage ?? 'Try adjusting your search or switching to All India.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((temple) => (
        <li key={temple.id}>
          <TempleCard
            temple={temple}
            active={activeId === temple.id}
            onHover={onHover}
            onClick={onCardClick}
          />
        </li>
      ))}

      {/* Infinite-scroll sentinel */}
      {hasMore && (
        <li ref={sentinelRef} aria-hidden className="h-4" />
      )}

      {/* Background page-load indicator */}
      {loadingMore && (
        <li className="flex justify-center py-3" aria-busy="true">
          <span
            className="animate-spin"
            style={{
              width: 24, height: 24,
              border: '2px solid rgba(15,36,82,0.15)',
              borderTopColor: '#0F2452',
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
        </li>
      )}
    </ul>
  );
}
