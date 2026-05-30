'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Temple } from '@/lib/temples-api';
import { FavoriteButton } from './FavoriteButton';
import { TempleFollowButton } from './TempleFollowButton';

/**
 * Single temple row used by both the Local and All-India lists, plus
 * the admin and detail-related views.
 *
 * Key changes from v1:
 *   - `next/image` for the thumbnail: lazy loading by default,
 *     responsive `sizes`, automatic WebP/AVIF when the host supports
 *     it. CloudFront sits in front; see next.config.js image host
 *     allowlist.
 *   - Links to /temple/[id] (the shareable detail page).
 *   - Emits onClick so callers can instrument analytics.
 */
export interface TempleCardProps {
  temple: Temple;
  active?: boolean;
  onHover?: (id: string | null) => void;
  /** Fires when the card is activated (click / Enter). */
  onClick?: (templeId: string) => void;
}

/** Format distance metres → "2.3 km" / "450 m" — India-appropriate precision. */
function formatDistance(m: number | undefined): string | null {
  if (m === undefined || m === null) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function TempleCard({ temple, active, onHover, onClick }: TempleCardProps) {
  const distance = formatDistance(temple.distanceM);

  return (
    <Link
      href={`/temple/${temple.id}`}
      onMouseEnter={() => onHover?.(temple.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(temple.id)}
      onBlur={() => onHover?.(null)}
      onClick={() => onClick?.(temple.id)}
      className="block rounded-2xl p-4 transition-all duration-200 active:scale-[.99]"
      style={{
        background: 'rgba(255,252,245,.92)',
        border: `1px solid ${active ? '#C8932A' : 'rgba(197,138,75,.18)'}`,
        boxShadow: active
          ? '0 8px 24px rgba(169,113,66,.22), inset 0 1px 0 rgba(255,255,255,.9)'
          : '0 2px 12px rgba(107,63,29,.06), inset 0 1px 0 rgba(255,255,255,.8)',
      }}
    >
      <div className="flex gap-3">
        {/* Thumbnail / fallback emblem */}
        <div
          className="flex-shrink-0 w-[68px] h-[68px] rounded-xl overflow-hidden relative"
          style={{
            background: temple.imageUrl
              ? 'transparent'
              : 'linear-gradient(135deg,#C8932A,#0F2452)',
          }}
        >
          {temple.imageUrl ? (
            <Image
              src={temple.imageUrl}
              alt=""
              fill
              sizes="68px"
              className="object-cover"
              // Cards scroll by the dozen; lazy-loading is the default
              // but we make it explicit for any reviewer.
              loading="lazy"
              // The image is decorative here — the name is the label — so
              // we set alt="" and let the link title do the work for AT.
            />
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center text-2xl"
              style={{ color: '#ffffff' }}
              aria-hidden
            >
              🛕
            </span>
          )}
          {temple.isVerified && (
            <span
              className="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: '#1E7E45' }}
              aria-label="Verified"
              title="Verified"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-[14px] font-semibold text-[#0F2452] leading-snug line-clamp-1"
              style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
            >
              {temple.name}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {distance && (
                <span className="text-[11px] font-semibold text-[#C8932A] whitespace-nowrap">
                  {distance}
                </span>
              )}
              {/* Heart button — stops propagation internally so a tap
                  here doesn't navigate to the detail page via the
                  outer <Link>. */}
              <FavoriteButton
                templeId={temple.id}
                templeName={temple.name}
                variant="card"
              />
              <TempleFollowButton templeId={temple.id} />
            </div>
          </div>

          {/* Rating + deity chip */}
          <div className="flex items-center gap-2 mt-1">
            {temple.ratingAvg !== null && temple.ratingCount > 0 ? (
              <span className="flex items-center gap-1 text-[11.5px] text-[#0F2452]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#C8932A" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="font-semibold">{temple.ratingAvg.toFixed(1)}</span>
                <span className="text-gray-400">({temple.ratingCount.toLocaleString()})</span>
              </span>
            ) : (
              <span className="text-[11.5px] text-gray-400">No reviews yet</span>
            )}
            {temple.deity && (
              <span
                className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold"
                style={{
                  background: 'rgba(201,168,76,0.12)',
                  color: '#9A7B1E',
                  border: '1px solid rgba(201,168,76,0.25)',
                }}
              >
                {temple.deity}
              </span>
            )}
          </div>

          {/* Address */}
          {temple.address && (
            <p className="text-[11.5px] text-gray-400 mt-1 line-clamp-1 leading-relaxed">
              {temple.address}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
