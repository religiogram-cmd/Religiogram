'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { templesApi, type Temple } from '@/lib/temples-api';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { analytics } from '@/lib/analytics';
import { FavoriteButton } from './FavoriteButton';

export interface TempleDetailProps {
  /** UUID from the URL segment. */
  id: string;
}

/**
 * Shareable temple detail view.
 *
 * Responsibilities
 * ----------------
 *   - Fetch the temple by id (with abort-on-unmount to avoid setState-on-
 *     unmounted-component warnings during fast route changes).
 *   - Render a hero image + metadata in a single responsive column.
 *   - Compute an optional "X km away" line if the user's location is in
 *     session cache (we do NOT re-prompt for location here — the home
 *     screen is the right place for that dialog, not a deep link).
 *   - Provide two first-class actions: Open in Maps (deeplink) and Share
 *     (native share sheet with clipboard fallback).
 *   - Log a `temple_click` analytics event on successful mount, so the
 *     same event fires whether the user opened this page via list, map,
 *     search, or an external shared link.
 *
 * What we intentionally do NOT do here
 * ------------------------------------
 *   - No reviews / ratings write path — scope creep for this milestone.
 *   - No admin-edit shortcut — admin CRUD lives on its own screen.
 *   - No SSR data-fetch — auth uses in-memory tokens that don't exist on
 *     the server, so we'd be fetching logged-out. Client fetch is fine.
 */
export function TempleDetail({ id }: TempleDetailProps) {
  const router = useRouter();
  const { coords } = useGeolocation();
  const { record: recordRecent } = useRecentlyViewed();
  const [temple, setTemple] = useState<Temple | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'notfound'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shareToast, setShareToast] = useState<string | null>(null);
  /**
   * Bumping this tick re-runs the fetch effect. Used by the Retry
   * button on the error screen — a much cleaner wire-up than lifting
   * the fetch function out of useEffect and juggling cleanup.
   */
  const [retryTick, setRetryTick] = useState(0);

  /* ── Data fetch ── */
  useEffect(() => {
    const ac = new AbortController();
    setStatus('loading');
    setErrorMsg('');

    templesApi
      .get(id, ac.signal)
      .then((t) => {
        setTemple(t);
        setStatus('loaded');
        // Fire analytics AFTER we've confirmed the temple exists — avoids
        // noisy events for typos / expired ids.
        analytics.templeClick(t.id, 'detail');
        // Record into recently-viewed — the retention loop that brings
        // users back to the home screen's "Recently viewed" strip. We
        // only push on a successful load so a 404 / error doesn't leave
        // a broken card in the list.
        recordRecent(t);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return; // unmount race
        if (err instanceof ApiError && err.status === 404) {
          setStatus('notfound');
          return;
        }
        setStatus('error');
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : 'Unable to load this temple. Please try again.',
        );
      });

    return () => ac.abort();
  }, [id, retryTick]);

  /* ── Derived: distance from user ── */
  const distanceLabel = useMemo(() => {
    if (!temple || !coords) return null;
    const m = haversineMetres(coords.lat, coords.lng, temple.lat, temple.lng);
    return formatDistance(m);
  }, [temple, coords]);

  /* ── Share handler ── */
  const handleShare = async () => {
    if (!temple) return;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareData = {
      title: temple.name,
      text: `${temple.name} — ${temple.city}`,
      url,
    };
    const navAny = navigator as Navigator & {
      share?: (data: typeof shareData) => Promise<void>;
    };
    if (navAny.share) {
      try {
        await navAny.share(shareData);
      } catch {
        /* user cancelled — nothing to do */
      }
      return;
    }
    // Fallback: copy to clipboard.
    try {
      await navigator.clipboard.writeText(url);
      setShareToast('Link copied');
      setTimeout(() => setShareToast(null), 1800);
    } catch {
      setShareToast('Press and hold to copy the URL');
      setTimeout(() => setShareToast(null), 2400);
    }
  };

  /* ── Loading skeleton ── */
  if (status === 'loading') {
    return <DetailSkeleton />;
  }

  /* ── 404 ── */
  if (status === 'notfound') {
    return (
      <EmptyShell
        emoji="🛕"
        title="Temple not found"
        message="This temple may have been removed or the link is incorrect."
        onBack={() => router.push('/home')}
      />
    );
  }

  /* ── Error ── */
  if (status === 'error' || !temple) {
    return (
      <EmptyShell
        emoji="⚠️"
        title="Couldn't load temple"
        message={errorMsg || 'Something went wrong. Please try again.'}
        onBack={() => router.push('/home')}
        onRetry={() => setRetryTick((n: any) => n + 1)}
      />
    );
  }

  const mapsUrl = buildGoogleMapsUrl(temple);

  return (
    <div
      className="min-h-svh"
      style={{
        background:
          'radial-gradient(ellipse 120% 40% at 50% 0%, #E8DFD0 0%, #F6F7FA 40%, #F6F7FA 100%)',
      }}
    >
      {/* Hero image — 16:9 on mobile, 4:3 on small-tablet and up. Fallback is
          a deity-emblem gradient matching the card emblem so the visual
          identity is consistent even without a photo. */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[4/3] overflow-hidden">
        {temple.imageUrl ? (
          <Image
            src={temple.imageUrl}
            alt={temple.name}
            fill
            // High-fidelity on mobile (covers ~100vw), capped at 960 on desktop.
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 960px"
            priority
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#C8932A,#0F2452)',
            }}
            aria-hidden
          >
            <span className="text-7xl" style={{ color: '#ffffff' }}>
              🛕
            </span>
          </div>
        )}
        {/* Back button — floats over the hero on mobile, always tappable */}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(255,252,245,.94)',
            border: '1px solid rgba(197,138,75,.24)',
            boxShadow: '0 4px 14px rgba(61,30,10,.18)',
            color: '#0F2452',
          }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {/* Top-right action cluster — Favorite + Share. Stacked so the
            hero stays tidy on narrow viewports. */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <FavoriteButton
            templeId={temple.id}
            templeName={temple.name}
            variant="hero"
            source="detail-hero"
          />
          <button
            type="button"
            onClick={handleShare}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,252,245,.94)',
              border: '1px solid rgba(197,138,75,.24)',
              boxShadow: '0 4px 14px rgba(61,30,10,.18)',
              color: '#0F2452',
            }}
            aria-label="Share this temple"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body — cream-card with rounded top that overlaps the hero */}
      <div
        className="relative -mt-6 rounded-t-[28px] px-5 pt-6 pb-24"
        style={{
          background: '#FFFCF5',
          boxShadow: '0 -6px 22px rgba(61,30,10,.08)',
        }}
      >
        <div className="max-w-2xl mx-auto">
          {/* Title + verified */}
          <div className="flex items-start justify-between gap-3">
            <h1
              className="text-[22px] sm:text-[26px] font-semibold text-[#0F2452] leading-tight"
              style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
            >
              {temple.name}
            </h1>
            {temple.isVerified && (
              <span
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                style={{
                  background: 'rgba(30,126,69,.1)',
                  color: '#1E7E45',
                  border: '1px solid rgba(30,126,69,.22)',
                }}
                title="Verified temple"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            )}
          </div>

          {/* City line */}
          <p className="text-[13px] text-gray-700/70 mt-1">
            {[temple.city, temple.state].filter(Boolean).join(', ')}
          </p>

          {/* Meta chip row — rating, deity, distance */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {temple.ratingAvg !== null && temple.ratingCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium"
                style={{
                  background: 'rgba(169,113,66,.12)',
                  color: '#0F2452',
                  border: '1px solid rgba(169,113,66,.18)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#C8932A" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{temple.ratingAvg.toFixed(1)}</span>
                <span className="text-gray-700/50">
                  ({temple.ratingCount.toLocaleString('en-IN')})
                </span>
              </span>
            ) : (
              <span className="text-[11.5px] text-gray-700/55">No reviews yet</span>
            )}

            {temple.deity && (
              <Chip>{temple.deity}</Chip>
            )}

            {distanceLabel && (
              <Chip>📍 {distanceLabel} away</Chip>
            )}
          </div>

          {/* Info card — address, hours */}
          <section
            className="mt-5 rounded-2xl p-4"
            style={{
              background: 'rgba(255,252,245,1)',
              border: '1px solid rgba(197,138,75,.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9)',
            }}
          >
            {temple.address && (
              <InfoRow
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                }
                label="Address"
              >
                {temple.address}
              </InfoRow>
            )}

            {temple.hours && (
              <InfoRow
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                }
                label="Opening hours"
              >
                {temple.hours}
              </InfoRow>
            )}

            {!temple.address && !temple.hours && (
              <p className="text-[12.5px] text-gray-700/55">
                No additional information yet.
              </p>
            )}
          </section>

          {/* Actions — Open in Maps (primary), Share (secondary on mobile where
              the share button in the hero is less discoverable for some users). */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl font-semibold text-[14px]"
              style={{
                background: 'linear-gradient(135deg,#C8932A,#C8932A)',
                color: '#FFFCF5',
                boxShadow: '0 6px 18px rgba(169,113,66,.35)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Open in Maps
            </a>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl font-semibold text-[14px]"
              style={{
                background: '#FFFCF5',
                color: '#0F2452',
                border: '1px solid rgba(169,113,66,.3)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>

          {/* Toast — short-lived confirmation for the clipboard-fallback path */}
          {shareToast && (
            <div
              role="status"
              className="mt-3 text-center text-[12.5px] font-medium text-[#0F2452]"
            >
              {shareToast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Small internal sub-components
 * ────────────────────────────────────────────────────────────────── */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium"
      style={{
        background: 'rgba(169,113,66,.1)',
        color: '#0F2452',
        border: '1px solid rgba(169,113,66,.16)',
      }}
    >
      {children}
    </span>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      <span
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: 'rgba(169,113,66,.12)', color: '#0F2452' }}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-gray-700/55 font-semibold">
          {label}
        </div>
        <div className="text-[13.5px] text-[#0F2452] leading-snug mt-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="min-h-svh" style={{ background: '#F6F7FA' }} aria-busy>
      <div
        className="w-full aspect-[16/10] sm:aspect-[4/3] bg-[#0F2452]/10 animate-pulse"
        aria-hidden
      />
      <div
        className="relative -mt-6 rounded-t-[28px] px-5 pt-6 pb-24"
        style={{ background: '#FFFCF5' }}
      >
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="h-6 w-3/4 bg-[#0F2452]/10 rounded animate-pulse" />
          <div className="h-3 w-1/3 bg-[#0F2452]/10 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-[#0F2452]/10 rounded animate-pulse" />
          <div className="h-24 bg-[#0F2452]/10 rounded-2xl animate-pulse mt-4" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="h-12 bg-[#0F2452]/10 rounded-2xl animate-pulse" />
            <div className="h-12 bg-[#0F2452]/10 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyShell({
  emoji,
  title,
  message,
  onBack,
  onRetry,
}: {
  emoji: string;
  title: string;
  message: string;
  onBack: () => void;
  /**
   * Only passed for the recoverable error case. When present the shell
   * shows a "Try again" button as the primary action and demotes "Back"
   * to a secondary outline button — retrying is almost always what the
   * user wants after a transient failure.
   */
  onRetry?: () => void;
}) {
  return (
    <div
      className="min-h-svh flex items-center justify-center px-6"
      style={{
        background:
          'radial-gradient(ellipse 120% 40% at 50% 0%, #E8DFD0 0%, #F6F7FA 40%, #F6F7FA 100%)',
      }}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full text-center"
        style={{
          background: '#FFFCF5',
          border: '1px solid rgba(197,138,75,.22)',
          boxShadow: '0 8px 28px rgba(61,30,10,.08)',
        }}
      >
        <div className="text-4xl mb-2" aria-hidden>{emoji}</div>
        <h1 className="text-[16px] font-semibold text-[#0F2452]">{title}</h1>
        <p className="text-[13px] text-gray-700/70 mt-1">{message}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl font-semibold text-[13.5px]"
              style={{
                background: 'linear-gradient(135deg,#C8932A,#C8932A)',
                color: '#FFFCF5',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center h-11 px-5 rounded-2xl font-semibold text-[13.5px]"
            style={
              onRetry
                ? {
                    background: '#FFFCF5',
                    color: '#0F2452',
                    border: '1px solid rgba(169,113,66,.3)',
                  }
                : {
                    background: 'linear-gradient(135deg,#C8932A,#C8932A)',
                    color: '#FFFCF5',
                  }
            }
          >
            Back to Discovery
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Pure helpers
 * ────────────────────────────────────────────────────────────────── */

/**
 * Haversine distance in metres between two WGS-84 points.
 *
 * We deliberately keep this client-side — the backend already returns
 * distanceM for /nearby, but the detail page is reached from many entry
 * points (search, shared link, All-India list) where distance isn't
 * pre-computed. A tiny local calc is cheaper than a round trip.
 */
function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // earth radius, m
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/**
 * Build a Google Maps URL that handles the web + mobile launch correctly.
 *
 * The documented "Maps URLs" schema (`/maps/search/?api=1&query=lat,lng`)
 * is the most-compatible across platforms: it launches the native Maps
 * app via OS intent on Android / iOS and opens a pin on the web map from
 * desktop. We pass coords rather than an address string because the
 * Maps geocoder can drift to a nearby POI when names collide.
 */
function buildGoogleMapsUrl(t: Temple): string {
  return `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`;
}

export default TempleDetail;
