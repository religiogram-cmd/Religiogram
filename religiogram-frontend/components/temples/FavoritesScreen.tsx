'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, type FavoriteTemple } from '@/lib/api';
import { useFavorites } from '@/hooks/useFavorites';
import type { Temple } from '@/lib/temples-api';
import { TempleList } from './TempleList';

/**
 * /favorites screen.
 *
 * Reuses the main TempleList so the visual language stays consistent —
 * same card, same hover model, same error affordances. The list's
 * `onRetry` hook gives us the "Try again" button on transient failures
 * for free.
 *
 * We reshape the server's FavoriteTemple into the Temple type expected
 * by TempleList. The only extra field is `favouritedAt`, which isn't
 * displayed in v1 but is kept in state in case we want to group by
 * "Saved this week / earlier" in a later iteration.
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const { refreshFullList } = useFavorites();
  const [items, setItems] = useState<FavoriteTemple[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    refreshFullList()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your favourites. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshFullList, retryTick]);

  // TempleList expects plain Temple objects; FavoriteTemple is a superset.
  const asTemples: Temple[] = items.map((t: any) => ({
    id: t.id,
    name: t.name,
    city: t.city,
    state: t.state,
    address: t.address,
    lat: t.lat,
    lng: t.lng,
    ratingAvg: t.ratingAvg,
    ratingCount: t.ratingCount,
    hours: t.hours,
    deity: t.deity,
    isVerified: t.isVerified,
    imageUrl: t.imageUrl,
  }));

  return (
    <div
      className="min-h-svh"
      style={{
        background:
          'radial-gradient(ellipse 120% 40% at 50% 0%, #E8DFD0 0%, #F6F7FA 40%, #F6F7FA 100%)',
      }}
    >
      <header className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(255,252,245,.9)',
            border: '1px solid rgba(197,138,75,.22)',
            color: '#0F2452',
          }}
          aria-label="Back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1
            className="text-[22px] font-bold text-[#0F2452] leading-tight"
            style={{ fontFamily: "'Playfair Display',serif" }}
          >
            My favourites
          </h1>
          <p className="text-[12.5px] text-gray-700/60 mt-0.5">
            {loading
              ? 'Loading saved temples…'
              : items.length === 0
              ? 'No temples saved yet.'
              : `${items.length} saved ${items.length === 1 ? 'temple' : 'temples'}`}
          </p>
        </div>
      </header>

      <div className="px-5 pb-8">
        {/* Custom empty state — more welcoming than the TempleList default,
            which is tuned for "search returned nothing". */}
        {!loading && !error && items.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center mt-4"
            style={{
              background: 'rgba(255,252,245,.8)',
              border: '1px dashed rgba(197,138,75,.3)',
            }}
          >
            <div className="text-4xl mb-3" aria-hidden>🤍</div>
            <p className="text-[14px] font-semibold text-[#0F2452]">
              No favourites yet
            </p>
            <p className="text-[12px] text-gray-700/60 mt-1 leading-relaxed max-w-xs mx-auto">
              Tap the heart on any temple card to save it here for quick
              access across your devices.
            </p>
            <Link
              href="/home"
              className="mt-5 inline-flex items-center justify-center h-11 px-5 rounded-2xl font-semibold text-[13.5px]"
              style={{
                background: 'linear-gradient(135deg,#C8932A,#C8932A)',
                color: '#FFFCF5',
              }}
            >
              Discover temples
            </Link>
          </div>
        ) : (
          <TempleList
            items={asTemples}
            loading={loading}
            error={error}
            activeId={activeId}
            onHover={setActiveId}
            onRetry={() => setRetryTick((n: any) => n + 1)}
            emptyMessage="No favourites yet."
          />
        )}
      </div>
    </div>
  );
}
