'use client';

import Link from 'next/link';

export type FaithType = 'temple' | 'mosque' | 'church' | 'gurudwara' | 'monastery' | 'synagogue';

export interface PlaceCardData {
  id: string;
  name: string;
  type: FaithType;
  rating: number;
  reviewCount: number;
  distance?: string;
  services: string[];
  isVerified: boolean;
  isOpen: boolean;
  coverGradient: [string, string]; // [from, to]
  icon: string;
  city?: string;
}

const FAITH_LABELS: Record<FaithType, string> = {
  temple: 'Temple',
  mosque: 'Mosque',
  church: 'Church',
  gurudwara: 'Gurudwara',
  monastery: 'Monastery',
  synagogue: 'Synagogue',
};

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8932A">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span className="text-[11.5px] font-bold" style={{ color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{value}</span>
    </div>
  );
}

export function PlaceCard({ place, compact = false }: { place: PlaceCardData; compact?: boolean }) {
  return (
    <Link href={`/places/${place.id}`}
      className="block rounded-2xl overflow-hidden transition-all duration-200 active:scale-[.97]"
      style={{
        background: 'rgba(255,252,245,.92)',
        border: '1px solid rgba(197,138,75,.18)',
        boxShadow: '0 3px 14px rgba(107,63,29,.08), inset 0 1px 0 rgba(255,255,255,.9)',
      }}
    >
      {/* Cover */}
      <div className="relative" style={{ height: compact ? 88 : 108 }}>
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: `linear-gradient(145deg, ${place.coverGradient[0]}e0, ${place.coverGradient[1]}a0)` }}>
          <span style={{ fontSize: compact ? 34 : 40, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.15))' }}>{place.icon}</span>
        </div>

        {/* Badges top row */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          {/* Faith type pill */}
          <span className="text-[8.5px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,.28)', color: 'rgba(255,255,255,.88)' }}>
            {FAITH_LABELS[place.type]}
          </span>
          {/* Open/Closed */}
          <span className={`text-[8.5px] font-semibold px-2 py-0.5 rounded-full ${place.isOpen ? 'text-white' : 'text-white/75'}`}
            style={{ background: place.isOpen ? 'rgba(39,174,96,.85)' : 'rgba(0,0,0,.38)' }}>
            {place.isOpen ? '● Open' : '○ Closed'}
          </span>
        </div>

        {/* Distance pill bottom-left */}
        {place.distance && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,.32)' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span className="text-[8.5px] font-semibold text-white">{place.distance}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <h3 className="text-[12.5px] font-semibold text-[#0F2452] leading-snug mb-1 line-clamp-2"
          style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {place.name}
        </h3>

        {/* Rating + verified */}
        <div className="flex items-center gap-2 mb-2">
          <StarRating value={place.rating} />
          <span className="text-[9.5px] text-gray-400">({(place.reviewCount / 1000).toFixed(1)}k)</span>
          {place.isVerified && (
            <span className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ml-auto"
              style={{ background: 'rgba(39,174,96,.12)', color: '#1E7E45', border: '1px solid rgba(39,174,96,.22)' }}>
              <svg width="7" height="7" viewBox="0 0 24 24" fill="#27AE60"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01" stroke="#fff" strokeWidth="2.5" fill="none"/></svg>
              Verified
            </span>
          )}
        </div>

        {/* Services chips */}
        <div className="flex flex-wrap gap-1">
          {place.services.slice(0, 3).map((s) => (
            <span key={s} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(169,113,66,.1)', color: '#9A7B1E', border: '1px solid rgba(169,113,66,.18)' }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
