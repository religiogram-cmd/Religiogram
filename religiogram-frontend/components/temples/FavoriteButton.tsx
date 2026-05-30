'use client';

import { useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { ApiError } from '@/lib/api';
import { analytics } from '@/lib/analytics';

/**
 * Heart button that toggles a temple's favourite state.
 *
 * Variants
 * --------
 *   - "card"    — compact, top-right corner of a TempleCard thumbnail
 *   - "hero"    — large, floating on the detail page hero (alongside Share)
 *
 * Optimistic UI: the fill animation runs the instant the user taps — the
 * underlying network call happens in the background. On failure the
 * shared `useFavorites.toggle` rolls the cache back, which re-renders
 * this button to its pre-tap state, and we show a short inline error
 * via the title attribute (toast infra lives on each parent page).
 *
 * We deliberately stop event propagation — without it, tapping the heart
 * inside a <Link> card would navigate to the detail page.
 */
export interface FavoriteButtonProps {
  templeId: string;
  /** Used for the aria-label so screen readers read "Favourite Kashi Vishwanath Temple". */
  templeName: string;
  variant?: 'card' | 'hero';
  /** Optional source tag for analytics — defaults to the variant. */
  source?: string;
}

export function FavoriteButton({
  templeId,
  templeName,
  variant = 'card',
  source,
}: FavoriteButtonProps) {
  const { isFavorite, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fav = isFavorite(templeId);

  const handleClick = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const nowFavorite = await toggle(templeId);
      analytics.favoriteToggle(templeId, nowFavorite, source ?? variant);
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : 'Could not update favourite. Try again.',
      );
      // Auto-clear the inline error so the title tip doesn't stay stuck.
      setTimeout(() => setErr(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const size = variant === 'hero' ? 40 : 28;
  const iconSize = variant === 'hero' ? 20 : 14;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={fav}
      aria-label={`${fav ? 'Unfavourite' : 'Favourite'} ${templeName}`}
      title={err ?? (fav ? 'Remove from favourites' : 'Add to favourites')}
      disabled={busy}
      className="flex items-center justify-center rounded-full transition-transform active:scale-90"
      style={{
        width: size,
        height: size,
        background:
          variant === 'hero'
            ? 'rgba(255,252,245,.94)'
            : fav
            ? 'rgba(231,76,60,.12)'
            : 'rgba(255,252,245,.9)',
        border: `1px solid ${
          fav ? 'rgba(231,76,60,.35)' : 'rgba(197,138,75,.24)'
        }`,
        boxShadow:
          variant === 'hero'
            ? '0 4px 14px rgba(61,30,10,.18)'
            : '0 1px 3px rgba(61,30,10,.08)',
        color: fav ? '#E74C3C' : '#0F2452',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={fav ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
