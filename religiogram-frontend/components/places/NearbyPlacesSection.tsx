'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { placesApi, type NearbyPlace } from '@/lib/api';
import { analytics } from '@/lib/analytics';

/**
 * NearbyPlacesSection — horizontal-scrolling strip of 5–10 nearby
 * places, rendered below the Services section on the public profile.
 *
 * Why a dedicated component?
 *   - It has its own fetch lifecycle (independent of /places/:id) so it
 *     can be shown/hidden without re-fetching the whole profile when
 *     the user grants location later on.
 *   - It owns an IntersectionObserver that fires `nearby_viewed` the
 *     first time the strip scrolls into view. Keeping that scoped here
 *     means the profile component doesn't need to know about viewport
 *     events.
 *
 * Fallback behaviour
 *   - No coords? We still fetch — the backend falls back to the anchor
 *     place's lat/lng so the response is always meaningful.
 *   - API failure? We hide the section silently rather than showing a
 *     broken state; nearby places are a discovery nice-to-have, not a
 *     required surface.
 */

export interface NearbyPlacesSectionProps {
  anchorPlaceId: string;
  /** Optional user coordinates — improves relevance when present. */
  userCoords?: { lat: number; lng: number } | null;
}

export default function NearbyPlacesSection({
  anchorPlaceId,
  userCoords,
}: NearbyPlacesSectionProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'empty' | 'error'>(
    'loading',
  );
  const [items, setItems] = useState<NearbyPlace[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedBeaconFiredRef = useRef(false);

  /* ── Fetch ── */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const hasCoords =
      !!userCoords &&
      Number.isFinite(userCoords.lat) &&
      Number.isFinite(userCoords.lng);

    placesApi
      .nearby(anchorPlaceId, {
        lat: hasCoords ? userCoords!.lat : undefined,
        lng: hasCoords ? userCoords!.lng : undefined,
        radiusKm: 15,
        limit: 10,
      })
      .then((rows) => {
        if (cancelled) return;
        if (!rows || rows.length === 0) {
          setStatus('empty');
          setItems([]);
          return;
        }
        setItems(rows);
        setStatus('loaded');
      })
      .catch((e) => {
        if (cancelled) return;
        // Discovery surface — hide silently on any error (ApiError or
        // network/unexpected). We only need a single failed state here
        // because the section unmounts visually when status === 'error'.
        void e;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [anchorPlaceId, userCoords?.lat, userCoords?.lng]);

  /* ── Fire `nearby_viewed` once, when the strip enters the viewport ── */
  useEffect(() => {
    if (status !== 'loaded' || viewedBeaconFiredRef.current) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      // No IO support — fall back to firing immediately on load.
      viewedBeaconFiredRef.current = true;
      analytics.nearbyViewed(anchorPlaceId, items.length);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !viewedBeaconFiredRef.current) {
            viewedBeaconFiredRef.current = true;
            analytics.nearbyViewed(anchorPlaceId, items.length);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [status, items.length, anchorPlaceId]);

  /* ── Nothing to render in the empty / error state ── */
  if (status === 'error' || status === 'empty') return null;

  return (
    <section aria-labelledby="nearby-heading">
      <div className="mb-3">
        <h2
          id="nearby-heading"
          className="text-[17px] font-bold text-[#0F2452]"
          style={{ fontFamily: "'Playfair Display',serif" }}
        >
          Nearby places
        </h2>
        <p className="text-[12px] text-gray-700/60 mt-0.5">
          Other places of worship within about 15 km
        </p>
      </div>

      <div
        ref={containerRef}
        className="-mx-5 px-5 overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {status === 'loading' ? (
          <SkeletonRow />
        ) : (
          <ul
            className="flex gap-3 pb-2"
            // On mobile the section benefits from "scroll snap" — each
            // card is a natural stopping point. Desktop doesn't care.
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {items.map((n: any, idx: any) => (
              <li
                key={n.id}
                style={{ scrollSnapAlign: 'start' }}
                className="flex-shrink-0 w-44"
              >
                <NearbyCard
                  place={n}
                  onClick={() =>
                    analytics.nearbyClicked(anchorPlaceId, n.id, idx)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ──────────────── Card ──────────────── */

function NearbyCard({
  place,
  onClick,
}: {
  place: NearbyPlace;
  onClick: () => void;
}) {
  const distanceLabel = useMemo(
    () => formatDistanceKm(place.distanceKm),
    [place.distanceKm],
  );

  return (
    <Link
      href={`/place/${encodeURIComponent(place.id)}`}
      onClick={onClick}
      className="block rounded-2xl overflow-hidden transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0F2452]/30"
      style={{
        background: 'rgba(255,252,245,.92)',
        border: '1px solid rgba(197,138,75,.18)',
        textDecoration: 'none',
      }}
    >
      <div className="relative w-full aspect-[4/3] bg-[#F6F7FA]/40">
        {place.imageUrl ? (
          <Image
            src={place.imageUrl}
            alt={place.name}
            fill
            sizes="176px"
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg,#F5D9B4 0%,#F6F7FA 60%,#E8DFD0 100%)',
            }}
            aria-hidden
          />
        )}
        {place.isVerified && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold"
            style={{
              background: 'rgba(255,252,245,.95)',
              color: '#1F8051',
              border: '1px solid rgba(31,128,81,.25)',
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Verified
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-[13px] font-semibold text-[#0F2452] leading-snug line-clamp-2 break-words">
          {place.name}
        </h3>
        <p className="text-[11.5px] text-gray-700/60 mt-0.5 truncate">
          {[place.city, place.state].filter(Boolean).join(', ')}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{
              background: 'rgba(197,138,75,.15)',
              color: '#6B3A14',
            }}
          >
            {distanceLabel}
          </span>
          {place.ratingAvg !== null && place.ratingCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-700/75 font-semibold">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {place.ratingAvg.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ──────────────── Atoms ──────────────── */

function SkeletonRow() {
  return (
    <ul className="flex gap-3 pb-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex-shrink-0 w-44">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,252,245,.6)',
              border: '1px solid rgba(197,138,75,.15)',
            }}
          >
            <div
              className="w-full aspect-[4/3] animate-pulse"
              style={{ background: 'rgba(197,138,75,.12)' }}
            />
            <div className="p-3 space-y-2">
              <div
                className="h-3 rounded animate-pulse"
                style={{ background: 'rgba(197,138,75,.15)' }}
              />
              <div
                className="h-2.5 w-2/3 rounded animate-pulse"
                style={{ background: 'rgba(197,138,75,.1)' }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * "2.3 km" / "850 m" formatting. Below 1 km we switch to metres (rounded
 * to the nearest 10 m) because "0.3 km" reads like less precision than
 * it actually is. Above 1 km we use one decimal place until 10 km, then
 * integer kilometres.
 */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const m = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return `${m} m`;
  }
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
