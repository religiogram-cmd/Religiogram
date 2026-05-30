'use client';

import { useState, useEffect, useCallback } from 'react';
import { tokenStore } from '@/lib/api';
import Link from 'next/link';
import { formatRupees } from '@/lib/format-currency';

/* ─── Types ───────────────────────────────────────────────── */
type GuideTab = 'nearby' | 'online' | 'top';

export interface SpiritualGuide {
  id: string;
  name: string;
  role: string;
  faith: string;
  rating: number;
  reviewCount: number;
  services: string[];
  isVerified: boolean;
  isOnline: boolean;
  distance?: string;
  priceFrom: number;
  experience: number; // years
  completedSessions: number;
  initials: string;
  avatarGradient: [string, string];
  languages: string[];
  bio: string;
}

/* ─── Data ────────────────────────────────────────────────── */
const ALL_GUIDES: SpiritualGuide[] = [
  {
    id: 'g1',
    name: 'Sample Vedic Priest',  // placeholder — replaced by API data
    role: 'Vedic Priest',
    faith: 'Hindu',
    rating: 4.9,
    reviewCount: 312,
    services: ['Griha Pravesh', 'Havan', 'Kundli Reading', 'Satyanarayan Puja'],
    isVerified: true,
    isOnline: true,
    distance: '1.4 km',
    priceFrom: 1500,
    experience: 18,
    completedSessions: 1240,
    initials: 'RS',
    avatarGradient: ['#C8932A', '#9A7B1E'],
    languages: ['Hindi', 'Sanskrit', 'English'],
    bio: 'Senior Vedic priest with 18 years of experience in conducting rituals across Delhi NCR and online.',
  },
  {
    id: 'g2',
    name: 'Maulana Abdul Qadeer',
    role: 'Islamic Scholar',
    faith: 'Islam',
    rating: 4.8,
    reviewCount: 189,
    services: ['Nikah Ceremony', 'Dua & Prayers', 'Quran Recitation', 'Aqiqah'],
    isVerified: true,
    isOnline: false,
    distance: '3.2 km',
    priceFrom: 1200,
    experience: 14,
    completedSessions: 876,
    initials: 'AQ',
    avatarGradient: ['#7A9E7E', '#4A7050'],
    languages: ['Urdu', 'Arabic', 'Hindi'],
    bio: 'Respected scholar with deep knowledge of Islamic rites, available for ceremonies and spiritual counselling.',
  },
  {
    id: 'g3',
    name: 'Father Thomas Mathew',
    role: 'Catholic Priest',
    faith: 'Christianity',
    rating: 4.7,
    reviewCount: 241,
    services: ['Sunday Mass', 'Baptism', 'Counselling', 'Marriage Ceremony'],
    isVerified: true,
    isOnline: true,
    distance: '5.1 km',
    priceFrom: 800,
    experience: 22,
    completedSessions: 1520,
    initials: 'TM',
    avatarGradient: ['#9B8EC4', '#6B5A94'],
    languages: ['English', 'Malayalam', 'Hindi'],
    bio: 'Parish priest with over two decades of ministry, offering spiritual guidance and sacramental services.',
  },
  {
    id: 'g4',
    name: 'Gyani Harpreet Singh',
    role: 'Granthi',
    faith: 'Sikhism',
    rating: 4.9,
    reviewCount: 156,
    services: ['Anand Karaj', 'Ardas', 'Kirtan', 'Akhand Path'],
    isVerified: true,
    isOnline: true,
    distance: '4.5 km',
    priceFrom: 1000,
    experience: 16,
    completedSessions: 940,
    initials: 'HS',
    avatarGradient: ['#C4965A', '#946630'],
    languages: ['Punjabi', 'Hindi', 'English'],
    bio: 'Certified Granthi trained at Sri Harmandir Sahib, specialising in wedding ceremonies and path recitations.',
  },
  {
    id: 'g5',
    name: 'Acharya Priya Devi',
    role: 'Meditation Guide',
    faith: 'Universal',
    rating: 5.0,
    reviewCount: 408,
    services: ['Guided Meditation', 'Yoga Nidra', 'Chakra Healing', 'Mantra Therapy'],
    isVerified: true,
    isOnline: true,
    distance: '2.8 km',
    priceFrom: 900,
    experience: 12,
    completedSessions: 2100,
    initials: 'PD',
    avatarGradient: ['#B87090', '#8B4060'],
    languages: ['Hindi', 'English'],
    bio: 'Internationally certified meditation and yoga instructor helping thousands achieve inner peace since 2012.',
  },
  {
    id: 'g6',
    name: 'Rabi Shlomo Levi',
    role: 'Jewish Rabbi',
    faith: 'Judaism',
    rating: 4.8,
    reviewCount: 94,
    services: ['Bar Mitzvah', 'Shabbat Services', 'Jewish Counselling', 'Lifecycle Events'],
    isVerified: true,
    isOnline: false,
    distance: '8.3 km',
    priceFrom: 2000,
    experience: 20,
    completedSessions: 560,
    initials: 'SL',
    avatarGradient: ['#6B8AB4', '#4B6A94'],
    languages: ['Hebrew', 'English', 'Hindi'],
    bio: 'Ordained rabbi serving the Jewish community in India, offering religious ceremonies and spiritual education.',
  },
];

/* ─── Helpers ─────────────────────────────────────────────── */
function getTabGuides(tab: GuideTab, guides: SpiritualGuide[]): SpiritualGuide[] {
  if (tab === 'online') return guides.filter((g) => g.isOnline);
  if (tab === 'top') return [...guides].sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  return guides; // nearby — sorted by distance implicitly
}

/* ─── Skeleton card ───────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-3xl p-4 overflow-hidden"
      style={{ background: 'rgba(255,252,245,.85)', border: '1px solid rgba(197,138,75,.14)' }}>
      <div className="flex gap-3 mb-3">
        <div className="w-14 h-14 rounded-2xl animate-pulse flex-shrink-0"
          style={{ background: 'rgba(169,113,66,.12)' }} />
        <div className="flex-1 flex flex-col gap-2 justify-center">
          <div className="h-3.5 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.1)', width: '72%' }} />
          <div className="h-3 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.08)', width: '50%' }} />
          <div className="h-3 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.08)', width: '35%' }} />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-20 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.08)' }} />
        ))}
      </div>
      <div className="h-9 rounded-2xl animate-pulse" style={{ background: 'rgba(169,113,66,.08)' }} />
    </div>
  );
}

/* ─── Provider card ───────────────────────────────────────── */
function ProviderCard({ guide }: { guide: SpiritualGuide }) {
  return (
    <Link href={`/guide/${guide.id}`}
      className="block rounded-3xl p-4 transition-all duration-200 active:scale-[.97] relative overflow-hidden"
      style={{
        background: 'rgba(255,252,245,.92)',
        border: '1px solid rgba(197,138,75,.18)',
        boxShadow: '0 4px 18px rgba(107,63,29,.08), inset 0 1px 0 rgba(255,255,255,.95)',
      }}>

      {/* Top row — avatar + info */}
      <div className="flex gap-3 mb-3">

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-[58px] h-[58px] rounded-2xl flex items-center justify-center text-[18px] font-bold"
            style={{
              background: `linear-gradient(145deg, ${guide.avatarGradient[0]}, ${guide.avatarGradient[1]})`,
              color: '#ffffff',
              fontFamily: "'Plus Jakarta Sans',sans-serif",
              boxShadow: `0 4px 14px ${guide.avatarGradient[1]}55`,
            }}>
            {guide.initials}
          </div>
          {/* Online dot */}
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2"
            style={{
              background: guide.isOnline ? '#27AE60' : '#94A3B8',
              borderColor: 'rgba(255,252,245,.95)',
            }}
          />
        </div>

        {/* Name + role + stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <h3 className="text-[13.5px] font-semibold text-[#0F2452] leading-tight line-clamp-1"
              style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.name}</h3>
            {/* Price */}
            <span className="flex-shrink-0 text-[12px] font-bold" style={{ color: '#C8932A', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              {formatRupees(guide.priceFrom)}+
            </span>
          </div>

          <p className="text-[11px] text-[#0F2452]/65 mb-1.5" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {guide.role}
          </p>

          {/* Rating + verified + distance */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8932A">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span className="text-[11.5px] font-bold text-[#0F2452]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.rating}</span>
              <span className="text-[10px] text-gray-700/45" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>({guide.reviewCount})</span>
            </div>

            {guide.isVerified && (
              <span className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(39,174,96,.12)', color: '#1E7E45', border: '1px solid rgba(39,174,96,.2)' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="#27AE60">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01" stroke="white" strokeWidth="2.5" fill="none"/>
                </svg>
                Verified
              </span>
            )}

            {guide.distance && (
              <span className="flex items-center gap-0.5 text-[9.5px] text-gray-700/50"
                style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {guide.distance}
              </span>
            )}

            <span className="flex items-center gap-1 text-[9.5px] font-medium ml-auto"
              style={{ color: guide.isOnline ? '#27AE60' : '#94A3B8', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: guide.isOnline ? '#27AE60' : '#94A3B8' }} />
              {guide.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-3"
        style={{ background: 'rgba(169,113,66,.06)', border: '1px solid rgba(169,113,66,.1)' }}>
        <div className="flex flex-col items-center flex-1">
          <span className="text-[13px] font-bold text-[#0F2452]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.experience}y</span>
          <span className="text-[9px] text-gray-700/50" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Experience</span>
        </div>
        <div className="w-px h-6" style={{ background: 'rgba(169,113,66,.2)' }} />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[13px] font-bold text-[#0F2452]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.completedSessions.toLocaleString()}</span>
          <span className="text-[9px] text-gray-700/50" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Sessions</span>
        </div>
        <div className="w-px h-6" style={{ background: 'rgba(169,113,66,.2)' }} />
        <div className="flex flex-col items-center flex-1">
          <span className="text-[13px] font-bold text-[#0F2452]" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{guide.languages.length}</span>
          <span className="text-[9px] text-gray-700/50" style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Languages</span>
        </div>
      </div>

      {/* Service chips */}
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        {guide.services.slice(0, 3).map((s) => (
          <span key={s} className="text-[9.5px] font-medium px-2 py-1 rounded-full"
            style={{ background: 'rgba(169,113,66,.1)', color: '#0F2452', border: '1px solid rgba(169,113,66,.2)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {s}
          </span>
        ))}
        {guide.services.length > 3 && (
          <span className="text-[9.5px] font-medium px-2 py-1 rounded-full"
            style={{ background: 'rgba(169,113,66,.07)', color: '#C8932A', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            +{guide.services.length - 3} more
          </span>
        )}
      </div>

      {/* CTA row */}
      <div className="flex gap-2">
        <button
          className="flex-1 h-10 rounded-2xl text-[12.5px] font-semibold transition-all active:scale-95"
          style={{
            background: 'linear-gradient(140deg, #C8932A, #C8932A)',
            color: '#ffffff',
            fontFamily: "'Plus Jakarta Sans',sans-serif",
            boxShadow: '0 3px 12px rgba(169,113,66,.38)',
          }}
          onClick={(e) => { e.preventDefault(); }}>
          Book Now
        </button>
        <button
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
          style={{ background: 'rgba(169,113,66,.1)', border: '1px solid rgba(169,113,66,.22)' }}
          onClick={(e) => { e.preventDefault(); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>

      {/* Subtle bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(to right, transparent, ${guide.avatarGradient[0]}, transparent)` }} />
    </Link>
  );
}

/* ─── Main section component ──────────────────────────────── */
export default function SpiritualGuides() {
  const [tab, setTab] = useState<GuideTab>('nearby');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [guides, setGuides] = useState<SpiritualGuide[]>(ALL_GUIDES);

  // Load live guides from the API; fall back to static data if unavailable
  useEffect(() => {
    fetch('/api/v1/providers?serviceType=all&limit=50', {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` },
    })
      .then(r => r.json())
      .then(data => {
        const items: SpiritualGuide[] = (data.items ?? data.providers ?? data.data ?? []).map((p: any) => ({
          id: p.id,
          name: p.displayName ?? p.name ?? 'Provider',
          role: p.role ?? p.specialization ?? 'Spiritual Guide',
          faith: p.religion ?? p.faith ?? '',
          rating: Number(p.rating ?? p.avgRating ?? 0),
          reviewCount: Number(p.reviewCount ?? p.totalReviews ?? 0),
          services: p.services ?? [],
          isVerified: p.isVerified ?? false,
          isOnline: p.isOnline ?? false,
          distance: p.distance,
          priceFrom: Number(p.priceFrom ?? p.basePrice ?? 0),
          experience: Number(p.experienceYears ?? p.experience ?? 0),
          completedSessions: Number(p.completedSessions ?? 0),
          initials: (p.displayName ?? p.name ?? 'P').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          avatarGradient: ['#C8932A', '#9A7B1E'] as [string, string],
          languages: p.languages ?? [],
          bio: p.bio ?? p.description ?? '',
        }));
        if (items.length > 0) setGuides(items);
      })
      .catch(() => { /* keep ALL_GUIDES fallback */ });
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, [tab]);

  const handleTabChange = useCallback((t: GuideTab) => setTab(t), []);

  const tabGuides = getTabGuides(tab, guides);
  const filtered = search
    ? tabGuides.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.role.toLowerCase().includes(search.toLowerCase()) ||
        g.services.some((s) => s.toLowerCase().includes(search.toLowerCase())))
    : tabGuides;

  const TABS: { id: GuideTab; label: string; icon: string }[] = [
    { id: 'nearby', label: 'Nearby', icon: '📍' },
    { id: 'online', label: 'Online Now', icon: '🟢' },
    { id: 'top', label: 'Top Rated', icon: '⭐' },
  ];

  return (
    <div className="min-h-svh pb-24"
      style={{ background: 'radial-gradient(ellipse 120% 40% at 50% 0%, #E8DFD0 0%, #F6F7FA 40%, #F6F7FA 100%)' }}>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 px-5 pt-3 pb-4"
        style={{ background: 'rgba(237,217,192,.94)', backdropFilter: 'blur(14px)' }}>

        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#0F2452', lineHeight: 1.2, marginBottom: 2 }}>
              Spiritual Guides
            </h1>
            <p style={{ fontSize: 11.5, color: 'rgba(107,63,29,.6)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              {filtered.length} verified guides available
            </p>
          </div>
          <button className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,252,245,.85)', border: '1px solid rgba(197,138,75,.2)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 h-11 px-4 rounded-2xl mb-3"
          style={{ background: 'rgba(255,252,245,.82)', border: '1.5px solid rgba(197,138,75,.28)', boxShadow: '0 1px 6px rgba(107,63,29,.06)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.65, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guides, services…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 13, color: '#0F2452', fontFamily: "'Plus Jakarta Sans',sans-serif" }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'rgba(107,63,29,.45)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-1 rounded-2xl"
          style={{ background: 'rgba(169,113,66,.1)', border: '1px solid rgba(169,113,66,.14)' }}>
          {TABS.map((t) => (
            <button key={t.id}
              onClick={() => handleTabChange(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] transition-all duration-200"
              style={{
                fontFamily: "'Plus Jakarta Sans',sans-serif",
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#6B3F1D' : 'rgba(107,63,29,.55)',
                background: tab === t.id ? '#fff' : 'transparent',
                boxShadow: tab === t.id ? '0 2px 10px rgba(107,63,29,.12)' : 'none',
              }}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-5 pt-4">

        {/* Faith filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
          {[
            { label: 'All Faiths', color: '#C8932A', bg: 'rgba(169,113,66,.12)', active: true },
            { label: 'Hindu', color: '#C8932A', bg: 'rgba(197,138,75,.1)', active: false },
            { label: 'Muslim', color: '#5A8C6B', bg: 'rgba(90,140,107,.1)', active: false },
            { label: 'Christian', color: '#6B5A8C', bg: 'rgba(107,90,140,.1)', active: false },
            { label: 'Sikh', color: '#8C7A3A', bg: 'rgba(140,122,58,.1)', active: false },
            { label: 'Universal', color: '#B87090', bg: 'rgba(184,112,144,.1)', active: false },
          ].map((f) => (
            <button key={f.label}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95"
              style={{
                background: f.active ? f.bg : 'rgba(255,252,245,.7)',
                color: f.active ? f.color : 'rgba(107,63,29,.55)',
                border: `1px solid ${f.active ? f.color + '35' : 'rgba(197,138,75,.18)'}`,
                fontFamily: "'Plus Jakarta Sans',sans-serif",
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="flex flex-col gap-4">
            {filtered.map((guide) => <ProviderCard key={guide.id} guide={guide} />)}
          </div>
        ) : (
          <div className="text-center py-14">
            <span className="text-5xl block mb-4">🔍</span>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#0F2452', marginBottom: 8 }}>
              No guides found
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(107,63,29,.6)', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
