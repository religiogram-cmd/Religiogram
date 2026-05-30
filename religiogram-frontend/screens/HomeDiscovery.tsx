'use client';

import { useState, useEffect } from 'react';
import { tokenStore } from '@/lib/api';
import Link from 'next/link';
import { Tabs } from '@/components/places/Tabs';
import { PlaceCard, type PlaceCardData } from '@/components/places/PlaceCard';
import { GuideCard, type GuideCardData } from '@/components/places/GuideCard';

/* ─── Static data (replace with API) ── */
const PLACES: PlaceCardData[] = [
  { id: '1', name: 'Govind Dev Ji Temple', type: 'temple', rating: 4.9, reviewCount: 2841, distance: '1.2 km', services: ['Puja', 'Aarti', 'Prasad'], isVerified: true, isOpen: true, coverGradient: ['#D4956A', '#C8932A'], icon: '🪔', city: 'Jaipur' },
  { id: '2', name: 'Jama Masjid Jaipur', type: 'mosque', rating: 4.7, reviewCount: 1245, distance: '3.1 km', services: ['Prayers', 'Nikah', 'Events'], isVerified: true, isOpen: true, coverGradient: ['#7A9E7E', '#5A8C6B'], icon: '🕌', city: 'Jaipur' },
  { id: '3', name: 'St. Xavier\'s Cathedral', type: 'church', rating: 4.6, reviewCount: 654, distance: '5.2 km', services: ['Mass', 'Baptism', 'Prayer'], isVerified: true, isOpen: false, coverGradient: ['#9B8EC4', '#6B5A8C'], icon: '⛪', city: 'Jaipur' },
  { id: '4', name: 'Guru Singh Sabha', type: 'gurudwara', rating: 4.8, reviewCount: 876, distance: '4.5 km', services: ['Prayers', 'Langar', 'Kirtan'], isVerified: true, isOpen: true, coverGradient: ['#C4965A', '#A07840'], icon: '🛕', city: 'Jaipur' },
  { id: '5', name: 'Birla Mandir', type: 'temple', rating: 4.8, reviewCount: 3240, distance: '6.1 km', services: ['Darshan', 'Puja', 'Donations'], isVerified: true, isOpen: true, coverGradient: ['#D4B896', '#B89070'], icon: '🪔', city: 'Jaipur' },
  { id: '6', name: 'Moti Doongri Temple', type: 'temple', rating: 4.9, reviewCount: 1932, distance: '2.7 km', services: ['Puja', 'Aarti', 'Rituals'], isVerified: false, isOpen: true, coverGradient: ['#C8932A', '#C8932A'], icon: '🪔', city: 'Jaipur' },
];

const INDIA_PLACES: PlaceCardData[] = [
  { id: 'i1', name: 'Golden Temple', type: 'gurudwara', rating: 5.0, reviewCount: 84210, services: ['Prayers', 'Langar', 'Kirtan'], isVerified: true, isOpen: true, coverGradient: ['#C8932A', '#C8932A'], icon: '🛕', city: 'Amritsar' },
  { id: 'i2', name: 'Tirupati Balaji', type: 'temple', rating: 4.9, reviewCount: 62445, services: ['Darshan', 'Puja', 'Prasad'], isVerified: true, isOpen: true, coverGradient: ['#D4956A', '#B87040'], icon: '🪔', city: 'Tirupati' },
  { id: 'i3', name: 'Jama Masjid Delhi', type: 'mosque', rating: 4.8, reviewCount: 41820, services: ['Prayers', 'Friday Namaz', 'Tours'], isVerified: true, isOpen: true, coverGradient: ['#7A9E7E', '#5A8070'], icon: '🕌', city: 'Delhi' },
  { id: 'i4', name: 'St. Thomas Cathedral', type: 'church', rating: 4.7, reviewCount: 18940, services: ['Mass', 'Confession', 'Marriages'], isVerified: true, isOpen: true, coverGradient: ['#9B8EC4', '#7B6EA4'], icon: '⛪', city: 'Mumbai' },
];

const GUIDES: GuideCardData[] = [
  { id: 'g1', name: 'Sample Vedic Priest', role: 'Vedic Priest', faith: 'Hindu', rating: 4.9, reviewCount: 312, services: ['Puja', 'Havan', 'Kundli'], isVerified: true, isOnline: true, priceFrom: 1500, initials: 'SP', avatarColor: ['#C8932A', '#9A7B1E'] }, // placeholder — replaced by API data
  { id: 'g2', name: 'Maulana A. Qadeer', role: 'Islamic Scholar', faith: 'Muslim', rating: 4.8, reviewCount: 189, services: ['Nikah', 'Dua', 'Quran'], isVerified: true, isOnline: false, priceFrom: 1200, initials: 'AQ', avatarColor: ['#7A9E7E', '#4A7050'] },
  { id: 'g3', name: 'Father Thomas Mathew', role: 'Catholic Priest', faith: 'Christian', rating: 4.7, reviewCount: 241, services: ['Mass', 'Counselling', 'Baptism'], isVerified: true, isOnline: true, priceFrom: 800, initials: 'TM', avatarColor: ['#9B8EC4', '#6B5A94'] },
  { id: 'g4', name: 'Gyani Harpreet Singh', role: 'Granthi', faith: 'Sikh', rating: 4.9, reviewCount: 156, services: ['Kirtan', 'Ardas', 'Anand Karaj'], isVerified: true, isOnline: false, priceFrom: 1000, initials: 'HS', avatarColor: ['#C4965A', '#946630'] },
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,252,245,.85)', border: '1px solid rgba(197,138,75,.14)' }}>
      <div className="h-[108px] animate-pulse" style={{ background: 'linear-gradient(90deg, rgba(169,113,66,.08) 25%, rgba(169,113,66,.15) 50%, rgba(169,113,66,.08) 75%)', backgroundSize: '200% 100%' }} />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-3.5 rounded-lg animate-pulse" style={{ background: 'rgba(169,113,66,.1)', width: '85%' }} />
        <div className="h-3 rounded-lg animate-pulse" style={{ background: 'rgba(169,113,66,.08)', width: '55%' }} />
        <div className="flex gap-1">
          <div className="h-4 w-14 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.08)' }} />
          <div className="h-4 w-14 rounded-full animate-pulse" style={{ background: 'rgba(169,113,66,.08)' }} />
        </div>
      </div>
    </div>
  );
}

export default function HomeDiscovery() {
  const [tab, setTab] = useState('nearby');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [liveGuides, setLiveGuides] = useState<GuideCardData[]>(GUIDES);

  // Load live guides from the API; keep GUIDES as fallback
  useEffect(() => {
    fetch('/api/v1/providers?serviceType=all&limit=20', {
      headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` },
    })
      .then(r => r.json())
      .then(data => {
        const items: GuideCardData[] = (data.items ?? data.providers ?? data.data ?? []).map((p: any) => ({
          id: p.id,
          name: p.displayName ?? p.name ?? 'Provider',
          role: p.role ?? p.specialization ?? 'Spiritual Guide',
          faith: p.religion ?? p.faith ?? '',
          rating: Number(p.rating ?? p.avgRating ?? 0),
          reviewCount: Number(p.reviewCount ?? p.totalReviews ?? 0),
          services: p.services ?? [],
          isVerified: p.isVerified ?? false,
          isOnline: p.isOnline ?? false,
          priceFrom: Number(p.priceFrom ?? p.basePrice ?? 0),
          initials: (p.displayName ?? p.name ?? 'P').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
          avatarColor: ['#C8932A', '#9A7B1E'] as [string, string],
        }));
        if (items.length > 0) setLiveGuides(items);
      })
      .catch(() => { /* keep GUIDES fallback */ });
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, [tab]);

  const displayPlaces = tab === 'nearby' ? PLACES : tab === 'india' ? INDIA_PLACES : [];

  const filtered = search
    ? displayPlaces.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.type.includes(search.toLowerCase()))
    : displayPlaces;

  return (
    <div className="min-h-svh" style={{ background: 'radial-gradient(ellipse 120% 40% at 50% 0%, #E8DFD0 0%, #F6F7FA 40%, #F6F7FA 100%)' }}>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 px-5 pt-3 pb-4"
        style={{ background: 'rgba(237,217,192,.94)', backdropFilter: 'blur(14px)' }}>

        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(145deg,#C8932A,#0F2452)', boxShadow: '0 3px 12px rgba(169,113,66,.4)' }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: 1.5 }}>RG</span>
            </div>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#C8932A', textTransform: 'uppercase' }}>Religio Gram</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full flex items-center justify-center relative"
              style={{ background: 'rgba(255,252,245,.85)', border: '1px solid rgba(197,138,75,.2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: '#E74C3C' }} />
            </button>
            <Link href="/home" className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,252,245,.85)', border: '1px solid rgba(197,138,75,.2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* Page title + location */}
        <div className="mb-3">
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 700, color: '#0F2452', lineHeight: 1.2, marginBottom: 3 }}>
            Nearby Places of Worship
          </h1>
          <div className="flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#C8932A', fontFamily: "'Inter',sans-serif" }}>Jaipur, Rajasthan</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2.5 h-11 px-4 rounded-2xl mb-3"
          style={{ background: 'rgba(255,252,245,.82)', border: '1.5px solid rgba(197,138,75,.28)', boxShadow: '0 1px 6px rgba(107,63,29,.06)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.65, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or type…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 13, color: '#0F2452', fontFamily: "'Inter',sans-serif" }} />
        </div>

        {/* Tabs */}
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'nearby', label: '📍 Nearby', },
            { id: 'india', label: '🇮🇳 Explore India' },
            { id: 'global', label: '🌍 Global' },
          ]}
        />
      </div>

      <div className="px-5 pt-4">

        {/* Faith category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
          {[
            { label: 'All', icon: '✨', color: '#C8932A', bg: 'rgba(169,113,66,.12)', active: true },
            { label: 'Temple', icon: '🪔', color: '#C8932A', bg: 'rgba(197,138,75,.1)', active: false },
            { label: 'Mosque', icon: '🕌', color: '#5A8C6B', bg: 'rgba(90,140,107,.1)', active: false },
            { label: 'Church', icon: '⛪', color: '#6B5A8C', bg: 'rgba(107,90,140,.1)', active: false },
            { label: 'Gurudwara', icon: '🛕', color: '#8C7A3A', bg: 'rgba(140,122,58,.1)', active: false },
          ].map((c) => (
            <button key={c.label}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
              style={{
                background: c.active ? c.bg : 'rgba(255,252,245,.7)',
                color: c.active ? c.color : 'rgba(107,63,29,.55)',
                border: `1px solid ${c.active ? c.color + '35' : 'rgba(197,138,75,.18)'}`,
                fontFamily: "'Inter',sans-serif",
              }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Places grid */}
        {tab !== 'global' ? (
          <div className="mb-6">
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((p) => <PlaceCard key={p.id} place={p} />)}
              </div>
            ) : (
              <div className="text-center py-10">
                <span className="text-4xl block mb-3">🔍</span>
                <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452', marginBottom: 6 }}>No results found</h3>
                <p style={{ fontSize: 12, color: 'rgba(107,63,29,.55)', fontFamily: "'Inter',sans-serif" }}>Try a different name or type</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 text-center mb-6">
            <span className="text-5xl block mb-4">🌍</span>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#0F2452', marginBottom: 8 }}>Global Pilgrimage Sites</h3>
            <p style={{ fontSize: 13, color: 'rgba(107,63,29,.6)', lineHeight: 1.6, maxWidth: 260, marginBottom: 18, fontFamily: "'Inter',sans-serif" }}>
              Discover Vatican City, Mecca, Jerusalem, Bodh Gaya and more sacred places worldwide.
            </p>
            <button className="px-6 py-3 rounded-2xl text-[14px] font-semibold text-[#ffffff]"
              style={{ background: 'linear-gradient(140deg,#C8932A,#C8932A)', boxShadow: '0 4px 16px rgba(169,113,66,.38)', fontFamily: "'Inter',sans-serif" }}>
              Coming Soon
            </button>
          </div>
        )}

        {/* Available Spiritual Guides */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2452' }}>
              Available Spiritual Guides
            </h2>
            <Link href="/search" style={{ fontSize: 11.5, fontWeight: 600, color: '#C8932A', fontFamily: "'Inter',sans-serif" }}>See all</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {liveGuides.map((g) => <GuideCard key={g.id} guide={g} />)}
          </div>
        </div>

      </div>
    </div>
  );
}
