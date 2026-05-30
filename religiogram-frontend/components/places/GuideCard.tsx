'use client';

import Link from 'next/link';
import { formatRupees } from '@/lib/format-currency';

export interface GuideCardData {
  id: string;
  name: string;
  role: string;
  faith: string;
  rating: number;
  reviewCount: number;
  services: string[];
  isVerified: boolean;
  isOnline: boolean;
  priceFrom: number;
  initials: string;
  avatarColor: [string, string];
}

export function GuideCard({ guide }: { guide: GuideCardData }) {
  return (
    <Link href={`/advisor/${guide.id}`}
      className="flex-shrink-0 w-[155px] rounded-2xl p-3.5 transition-all duration-200 active:scale-[.97]"
      style={{
        background: 'rgba(255,252,245,.92)',
        border: '1px solid rgba(197,138,75,.18)',
        boxShadow: '0 3px 12px rgba(107,63,29,.07), inset 0 1px 0 rgba(255,255,255,.9)',
      }}
    >
      {/* Avatar */}
      <div className="relative mb-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold"
          style={{
            background: `linear-gradient(145deg, ${guide.avatarColor[0]}, ${guide.avatarColor[1]})`,
            color: '#ffffff',
            fontFamily: "'Plus Jakarta Sans',sans-serif",
            boxShadow: `0 3px 12px ${guide.avatarColor[1]}55`,
          }}>
          {guide.initials}
        </div>
        {guide.isOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
            style={{ background: '#27AE60', borderColor: 'rgba(255,252,245,.95)' }} />
        )}
      </div>

      {/* Info */}
      <h3 className="text-[12px] font-semibold text-[#0F2452] leading-tight mb-0.5 line-clamp-1"
        style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.name}</h3>
      <p className="text-[10px] text-[#0F2452]/65 mb-2 line-clamp-1">{guide.role}</p>

      {/* Verified badge */}
      {guide.isVerified && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(39,174,96,.1)', color: '#1E7E45', border: '1px solid rgba(39,174,96,.2)' }}>
            ✓ Verified
          </span>
        </div>
      )}

      {/* Rating */}
      <div className="flex items-center gap-1 mb-2.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8932A">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span className="text-[11px] font-bold text-[#0F2452]">{guide.rating}</span>
        <span className="text-[9.5px] text-gray-700/45">({guide.reviewCount})</span>
      </div>

      {/* Price */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold" style={{ color: '#C8932A' }}>
          {formatRupees(guide.priceFrom)}+
        </span>
        <span className="text-[9px] text-gray-700/45">/ session</span>
      </div>
    </Link>
  );
}
