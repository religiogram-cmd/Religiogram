'use client';

import { useState, useEffect, useCallback , Suspense} from 'react';
import { useReligion } from '@/lib/useReligion';
import ReligionPicker from '@/components/discovery/ReligionPicker';
import PriestJourneyScreen from '@/components/priests/PriestJourneyScreen';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { tokenStore } from '@/lib/api';
import { formatPerMinute } from '@/lib/format-currency';

/* ── Design tokens ── */
const GOLD  = '#C8920A';
const GOLD2 = '#E8B430';
const NAVY  = '#0A1628';
const BG    = '#FDF6E3';
const CARD  = '#FFFAED';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

/* ════════════════════════════════════════════════════════
   DATA — Rituals catalogue (kept for BookAGuideTab)
   ════════════════════════════════════════════════════════ */

type BookReligion = 'hindu' | 'muslim' | 'christian' | 'sikh' | 'buddhist' | 'jain';

interface Ritual {
  id: string; name: string; icon: string; duration: string;
  priceFrom: number; category: string;
}

const RITUALS: Record<BookReligion, Ritual[]> = {
  hindu: [
    { id: 'h1',  name: 'Satyanarayan Puja',          icon: '🪔', duration: '2–3 hrs',  priceFrom: 150100, category: 'Pooja & Worship' },
    { id: 'h2',  name: 'Ganesh Puja',                 icon: '🐘', duration: '1–2 hrs',  priceFrom: 100100, category: 'Pooja & Worship' },
    { id: 'h3',  name: 'Lakshmi Puja',                icon: '🌸', duration: '1–2 hrs',  priceFrom: 120100, category: 'Pooja & Worship' },
    { id: 'h4',  name: 'Durga Puja',                  icon: '🪷', duration: '3–4 hrs',  priceFrom: 200100, category: 'Pooja & Worship' },
    { id: 'h5',  name: 'Hanuman Puja',                icon: '🙏', duration: '1–2 hrs',  priceFrom: 110100, category: 'Pooja & Worship' },
    { id: 'h6',  name: 'Shiv Puja',                   icon: '🕉️', duration: '2–3 hrs',  priceFrom: 130100, category: 'Pooja & Worship' },
    { id: 'h7',  name: 'Kali Puja',                   icon: '🔱', duration: '3–5 hrs',  priceFrom: 250100, category: 'Pooja & Worship' },
    { id: 'h8',  name: 'Saraswati Puja',              icon: '📚', duration: '1–2 hrs',  priceFrom: 100100, category: 'Pooja & Worship' },
    { id: 'h9',  name: 'Namkaran (Naming Ceremony)',  icon: '👶', duration: '1–2 hrs',  priceFrom: 120100, category: 'Life Ceremonies' },
    { id: 'h10', name: 'Mundan (First Haircut)',       icon: '✂️', duration: '1 hr',     priceFrom: 90100,  category: 'Life Ceremonies' },
    { id: 'h11', name: 'Upanayana (Thread Ceremony)', icon: '🧵', duration: '4–6 hrs',  priceFrom: 500100, category: 'Life Ceremonies' },
    { id: 'h12', name: 'Vivah (Wedding Ceremony)',    icon: '💍', duration: '6–8 hrs',  priceFrom: 1000100,category: 'Life Ceremonies' },
    { id: 'h13', name: 'Griha Pravesh (Housewarming)',icon: '🏠', duration: '2–3 hrs',  priceFrom: 200100, category: 'Life Ceremonies' },
    { id: 'h14', name: 'Antyesti (Last Rites)',       icon: '🪸', duration: '3–5 hrs',  priceFrom: 300100, category: 'Life Ceremonies' },
    { id: 'h15', name: 'Navagraha Havan',             icon: '🔥', duration: '3–4 hrs',  priceFrom: 350100, category: 'Havan & Yagna' },
    { id: 'h16', name: 'Vastu Shanti Puja',           icon: '🏛️', duration: '4–5 hrs',  priceFrom: 400100, category: 'Havan & Yagna' },
    { id: 'h17', name: 'Mrityunjay Havan',            icon: '☀️', duration: '3–4 hrs',  priceFrom: 350100, category: 'Havan & Yagna' },
    { id: 'h18', name: 'Rudrabhishek',                icon: '💧', duration: '2–3 hrs',  priceFrom: 250100, category: 'Havan & Yagna' },
    { id: 'h19', name: 'Navratri Puja',               icon: '🎋', duration: '9 days',   priceFrom: 800100, category: 'Seasonal Festivals' },
    { id: 'h20', name: 'Pitru Paksha (Shraddha)',     icon: '🌿', duration: '2–3 hrs',  priceFrom: 200100, category: 'Seasonal Festivals' },
    { id: 'h21', name: 'Sunderkand Path',             icon: '📖', duration: '3–4 hrs',  priceFrom: 200100, category: 'Seasonal Festivals' },
    { id: 'h22', name: 'Birthday Puja',               icon: '🎂', duration: '1–2 hrs',  priceFrom: 100100, category: 'Seasonal Festivals' },
  ],
  muslim: [
    { id: 'm1',  name: 'Nikah (Wedding)',              icon: '💍', duration: '1–2 hrs',  priceFrom: 200100, category: 'Life Events' },
    { id: 'm2',  name: 'Aqeeqa (7th Day Ceremony)',   icon: '👶', duration: '2–3 hrs',  priceFrom: 180100, category: 'Life Events' },
    { id: 'm3',  name: 'Bismillah Ceremony',           icon: '📖', duration: '1 hr',     priceFrom: 100100, category: 'Life Events' },
    { id: 'm4',  name: 'Khatna (Circumcision)',        icon: '🌙', duration: '1 hr',     priceFrom: 150100, category: 'Life Events' },
    { id: 'm5',  name: 'Janaza (Funeral Prayer)',      icon: '🌿', duration: '1–2 hrs',  priceFrom: 100100, category: 'Life Events' },
    { id: 'm6',  name: 'Quran Recitation',             icon: '📖', duration: '1–3 hrs',  priceFrom: 80100,  category: 'Prayer & Worship' },
    { id: 'm7',  name: 'Dua (Special Supplication)',   icon: '🙏', duration: '30 min',   priceFrom: 50100,  category: 'Prayer & Worship' },
    { id: 'm8',  name: "Maulud (Prophet's Birthday)", icon: '⭐', duration: '2–3 hrs',  priceFrom: 150100, category: 'Prayer & Worship' },
    { id: 'm9',  name: 'Eid Prayer Service',           icon: '🌙', duration: '1–2 hrs',  priceFrom: 100100, category: 'Occasions' },
    { id: 'm10', name: 'Ramadan Khatam Recitation',   icon: '📿', duration: '2–4 hrs',  priceFrom: 200100, category: 'Occasions' },
  ],
  christian: [
    { id: 'c1',  name: 'Baptism',                icon: '💧', duration: '1–2 hrs',   priceFrom: 100100, category: 'Sacraments' },
    { id: 'c2',  name: 'First Holy Communion',   icon: '🍞', duration: '1–2 hrs',   priceFrom: 120100, category: 'Sacraments' },
    { id: 'c3',  name: 'Confirmation',           icon: '✝️', duration: '1–2 hrs',   priceFrom: 100100, category: 'Sacraments' },
    { id: 'c4',  name: 'Anointing of the Sick',  icon: '🕯️', duration: '30–60 min', priceFrom: 80100,  category: 'Sacraments' },
    { id: 'c5',  name: 'Christian Wedding',      icon: '💍', duration: '1–2 hrs',   priceFrom: 300100, category: 'Life Events' },
    { id: 'c6',  name: 'Funeral Service',        icon: '🌿', duration: '1–2 hrs',   priceFrom: 150100, category: 'Life Events' },
    { id: 'c7',  name: 'Memorial Mass',          icon: '🕯️', duration: '1 hr',      priceFrom: 100100, category: 'Life Events' },
    { id: 'c8',  name: 'House Blessing',         icon: '🏠', duration: '1 hr',      priceFrom: 80100,  category: 'Blessings' },
    { id: 'c9',  name: 'Car Blessing',           icon: '🚗', duration: '30 min',    priceFrom: 50100,  category: 'Blessings' },
    { id: 'c10', name: 'Christmas Mass',         icon: '⭐', duration: '1–2 hrs',   priceFrom: 120100, category: 'Services' },
    { id: 'c11', name: 'Easter Service',         icon: '🌅', duration: '1–2 hrs',   priceFrom: 120100, category: 'Services' },
    { id: 'c12', name: 'Sunday Service',         icon: '📖', duration: '1 hr',      priceFrom: 80100,  category: 'Services' },
  ],
  sikh: [
    { id: 's1',  name: 'Anand Karaj (Wedding)',       icon: '💍', duration: '2–4 hrs',  priceFrom: 400100, category: 'Ceremonies' },
    { id: 's2',  name: 'Naam Karan (Naming)',         icon: '👶', duration: '1–2 hrs',  priceFrom: 120100, category: 'Ceremonies' },
    { id: 's3',  name: 'Amrit Sanchar (Initiation)', icon: '💧', duration: '4–6 hrs',  priceFrom: 500100, category: 'Ceremonies' },
    { id: 's4',  name: 'Antim Ardas (Last Rites)',   icon: '🌿', duration: '1–2 hrs',  priceFrom: 150100, category: 'Ceremonies' },
    { id: 's5',  name: 'Akhand Path (48-hr Reading)',icon: '📖', duration: '48 hrs',   priceFrom: 800100, category: 'Prayer Services' },
    { id: 's6',  name: 'Sehaj Path',                 icon: '📿', duration: 'Flexible', priceFrom: 400100, category: 'Prayer Services' },
    { id: 's7',  name: 'Ardas (Community Prayer)',   icon: '🙏', duration: '30 min',   priceFrom: 60100,  category: 'Prayer Services' },
    { id: 's8',  name: 'Sukhmani Sahib Path',        icon: '🪷', duration: '2 hrs',    priceFrom: 150100, category: 'Prayer Services' },
    { id: 's9',  name: 'Gurpurab Celebration',       icon: '✨', duration: '3–5 hrs',  priceFrom: 300100, category: 'Occasions' },
    { id: 's10', name: 'Baisakhi Celebration',       icon: '🎊', duration: '2–3 hrs',  priceFrom: 200100, category: 'Occasions' },
  ],
  buddhist: [
    { id: 'b1',  name: 'Group Meditation Session',   icon: '🧘', duration: '1–2 hrs',  priceFrom: 80100,  category: 'Meditation' },
    { id: 'b2',  name: 'Vipassana Ceremony',         icon: '☮️', duration: '1 hr',     priceFrom: 100100, category: 'Meditation' },
    { id: 'b3',  name: 'Guided Mindfulness',         icon: '🌿', duration: '45 min',   priceFrom: 60100,  category: 'Meditation' },
    { id: 'b4',  name: 'Wedding Blessing',           icon: '💍', duration: '1 hr',     priceFrom: 150100, category: 'Ceremonies' },
    { id: 'b5',  name: 'Baby Naming Ceremony',       icon: '👶', duration: '1 hr',     priceFrom: 100100, category: 'Ceremonies' },
    { id: 'b6',  name: 'Funeral Rites',              icon: '🌸', duration: '2–3 hrs',  priceFrom: 200100, category: 'Ceremonies' },
    { id: 'b7',  name: 'House Blessing',             icon: '🏠', duration: '1 hr',     priceFrom: 100100, category: 'Ceremonies' },
    { id: 'b8',  name: 'Dharma Talk',                icon: '📖', duration: '1–2 hrs',  priceFrom: 120100, category: 'Teachings' },
    { id: 'b9',  name: 'Sutra Recitation',           icon: '📿', duration: '1–2 hrs',  priceFrom: 100100, category: 'Teachings' },
    { id: 'b10', name: 'Vesak Ceremony',             icon: '🌕', duration: '2–3 hrs',  priceFrom: 200100, category: 'Occasions' },
  ],
  jain: [
    { id: 'j1',  name: 'Paryushana Puja',            icon: '🔷', duration: '2–3 hrs',  priceFrom: 200100, category: 'Worship' },
    { id: 'j2',  name: 'Samayika',                   icon: '🧘', duration: '48 min',   priceFrom: 80100,  category: 'Worship' },
    { id: 'j3',  name: 'Pratikraman',                icon: '🙏', duration: '1–2 hrs',  priceFrom: 100100, category: 'Worship' },
    { id: 'j4',  name: 'Snatra Puja',                icon: '💧', duration: '2 hrs',    priceFrom: 150100, category: 'Worship' },
    { id: 'j5',  name: 'Navkar Mantra Recitation',   icon: '📿', duration: '30 min',   priceFrom: 50100,  category: 'Worship' },
    { id: 'j6',  name: 'Wedding Ceremony',           icon: '💍', duration: '3–5 hrs',  priceFrom: 400100, category: 'Ceremonies' },
    { id: 'j7',  name: 'Thread Ceremony',            icon: '🧵', duration: '2–3 hrs',  priceFrom: 250100, category: 'Ceremonies' },
    { id: 'j8',  name: 'Dashalakshana Puja',         icon: '⭐', duration: '10 days',  priceFrom: 1000100,category: 'Ceremonies' },
  ],
};

const BOOK_RELIGIONS: { key: BookReligion; label: string; icon: string; accent: string }[] = [
  { key: 'hindu',     label: 'Hindu',     icon: '🪔', accent: '#B85C1A' },
  { key: 'muslim',    label: 'Muslim',    icon: '🕌', accent: '#1A7C5A' },
  { key: 'christian', label: 'Christian', icon: '✝️', accent: '#5B3FA0' },
  { key: 'sikh',      label: 'Sikh',      icon: '🛕', accent: '#C8920A' },
  { key: 'buddhist',  label: 'Buddhist',  icon: '☸️', accent: '#B84A10' },
  { key: 'jain',      label: 'Jain',      icon: '🔷', accent: '#0A5A8C' },
];

type SortOption = 'popularity'|'exp_high_low'|'exp_low_high'|'orders_high_low'|'orders_low_high'|'price_high_low'|'price_low_high'|'rating_high_low';
interface AstroFilters { sort: SortOption; skills: string[]; langs: string[]; gender: string; country: string; offer: string[]; topOnly: string[]; }
const DEFAULT_FILTERS: AstroFilters = { sort: 'popularity', skills: [], langs: [], gender: '', country: '', offer: [], topOnly: [] };
type FilterCategoryKey = 'sort'|'skill'|'language'|'gender'|'country'|'offer'|'top';
interface FilterCategory { key: FilterCategoryKey; label: string; multi: boolean; options: { value: string; label: string }[]; }
const FILTER_CATEGORIES: FilterCategory[] = [
  { key: 'sort', label: 'Sort by', multi: false, options: [
    { value: 'popularity', label: 'Popularity' }, { value: 'exp_high_low', label: 'Experience: High to Low' },
    { value: 'exp_low_high', label: 'Experience: Low to High' }, { value: 'orders_high_low', label: 'Orders: High to Low' },
    { value: 'orders_low_high', label: 'Orders: Low to High' }, { value: 'price_high_low', label: 'Price: High to Low' },
    { value: 'price_low_high', label: 'Price: Low to High' }, { value: 'rating_high_low', label: 'Rating: High to Low' },
  ]},
  { key: 'skill', label: 'Skill', multi: true, options: [
    { value: 'Vedic', label: 'Vedic Astrology' }, { value: 'Tarot', label: 'Tarot' }, { value: 'KP', label: 'KP Astrology' },
    { value: 'Numerology', label: 'Numerology' }, { value: 'Vastu', label: 'Vastu' }, { value: 'Palmistry', label: 'Palmistry' },
    { value: 'Kundli', label: 'Kundli' }, { value: 'Face Reading', label: 'Face Reading' }, { value: 'Prashna Kundli', label: 'Prashna Kundli' },
  ]},
  { key: 'language', label: 'Language', multi: true, options: [
    { value: 'Hindi', label: 'Hindi' }, { value: 'English', label: 'English' }, { value: 'Tamil', label: 'Tamil' },
    { value: 'Telugu', label: 'Telugu' }, { value: 'Bengali', label: 'Bengali' }, { value: 'Marathi', label: 'Marathi' },
    { value: 'Gujarati', label: 'Gujarati' }, { value: 'Malayalam', label: 'Malayalam' }, { value: 'Punjabi', label: 'Punjabi' },
    { value: 'Kannada', label: 'Kannada' }, { value: 'Urdu', label: 'Urdu' },
  ]},
  { key: 'gender', label: 'Gender', multi: false, options: [{ value: '', label: 'All' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }] },
  { key: 'country', label: 'Country', multi: false, options: [
    { value: '', label: 'All Countries' }, { value: 'India', label: 'India' }, { value: 'USA', label: 'USA' },
    { value: 'UK', label: 'UK' }, { value: 'Canada', label: 'Canada' }, { value: 'Australia', label: 'Australia' },
  ]},
  { key: 'offer', label: 'Offer', multi: true, options: [
    { value: 'new_user', label: 'New User Offer' }, { value: 'free_chat', label: 'Free First Chat' },
    { value: 'disc10', label: 'Discount > 10%' }, { value: 'disc20', label: 'Discount > 20%' }, { value: 'disc30', label: 'Discount > 30%' },
  ]},
  { key: 'top', label: 'Top Consultants', multi: true, options: [
    { value: 'celebrity', label: 'Celebrity Consultant' }, { value: 'verified', label: 'Verified Only' },
    { value: 'rating45', label: '4.5+ Rating' }, { value: 'orders1k', label: '1000+ Orders' },
  ]},
];

function paise(p: number) { return (p/100).toLocaleString('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:0}); }
function initials(n: string) { return n.split(' ').map((w: string)=>w[0]).join('').slice(0,2).toUpperCase(); }
function countActive(f: AstroFilters) { return f.skills.length + f.langs.length + (f.gender?1:0) + (f.country?1:0) + f.offer.length + f.topOnly.length; }

/* ════════════════════════════════════════════════════════
   SECTION BANNER
   ════════════════════════════════════════════════════════ */
function SectionBanner({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ background: NAVY, borderRadius: 12, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: GOLD, fontWeight: 800, fontSize: 14, fontFamily: "'Playfair Display',serif", letterSpacing: 0.3 }}>
        ❮❮ {title} {count !== undefined ? count : ''} ❯
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   PROVIDER CARD — live API shape
   ════════════════════════════════════════════════════════ */
interface ApiProvider {
  id: string; name: string;
  specialties?: string[]; rating?: number; reviewCount?: number;
  experience?: number; pricePerMinutePaise?: number; priceFrom?: number;
  isOnline?: boolean; verified?: boolean; color?: string;
  languages?: string[];
}

function ProviderCardOffline({ p }: { p: ApiProvider }) {
  const router = useRouter();
  const col = p.color ?? NAVY;
  return (
    <div style={{
      background: CARD, border: `1px solid rgba(200,146,10,.25)`, borderRadius: 18,
      overflow: 'hidden', display: 'flex', flexDirection: 'row', marginBottom: 14,
      boxShadow: '0 2px 12px rgba(200,146,10,.10)',
    }}>
      <div style={{
        width: '38%', minHeight: 148, flexShrink: 0,
        background: `linear-gradient(160deg,${col}ee,${col}88)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', position: 'relative',
        borderRight: `1px solid rgba(200,146,10,.18)`,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `linear-gradient(135deg,rgba(255,255,255,.25),rgba(255,255,255,.05))`,
          border: `3px solid rgba(255,255,255,.55)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 18px rgba(0,0,0,.18)`,
        }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', Georgia, serif" }}>
            {initials(p.name)}
          </span>
        </div>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: "'Playfair Display', serif" }}>
            {p.priceFrom ? paise(p.priceFrom) : '—'}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.75)', fontWeight: 600, letterSpacing: 0.5 }}>ONWARDS</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 12px 12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: NAVY, fontFamily: "'Playfair Display', Georgia, serif" }}>{p.name}</span>
            {p.verified && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <svg width="13" height="13" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#22C55E"/><path d="M7 12l3.5 3.5L17 8.5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#1F7A4A' }}>Verified</span>
              </span>
            )}
          </div>
          {p.rating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              <span style={{ color: GOLD, fontSize: 12 }}>★</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{p.rating}</span>
              {p.reviewCount != null && <span style={{ fontSize: 10, color: 'rgba(10,22,40,.45)' }}>({p.reviewCount.toLocaleString()})</span>}
            </div>
          )}
          {p.experience != null && (
            <div style={{ fontSize: 10.5, color: 'rgba(10,22,40,.55)', marginBottom: 6 }}>
              {p.experience} yrs exp{p.languages?.length ? ' · ' + p.languages.join(' · ') : ''}
            </div>
          )}
          {p.specialties && p.specialties.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {p.specialties.slice(0, 2).map((s: string) => (
                <span key={s} style={{ fontSize: 9, fontWeight: 700, background: `rgba(200,146,10,.12)`, color: '#7A5800', padding: '2px 7px', borderRadius: 10, border: `1px solid rgba(200,146,10,.25)` }}>{s}</span>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => router.push('/book/' + p.id)} style={{
          display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer',
          background: `linear-gradient(135deg,${NAVY},#1B3A7A)`,
          color: GOLD, borderRadius: 12, padding: '8px 10px',
          fontSize: 12, fontWeight: 800, fontFamily: "'Playfair Display', serif",
          border: `1px solid rgba(200,146,10,.35)`, letterSpacing: 0.3,
        }}>
          Book Now ›
        </button>
      </div>
    </div>
  );
}

function ProviderCardOnline({ p }: { p: ApiProvider }) {
  const router = useRouter();
  const rateDisplay = p.pricePerMinutePaise != null
    ? formatPerMinute(p.pricePerMinutePaise)
    : '—';
  const col = p.color ?? '#7B2D8B';
  return (
    <div style={{ background: CARD, border: `1px solid rgba(200,146,10,.2)`, borderRadius: 18, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: `linear-gradient(135deg,${col},${col}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid rgba(200,146,10,.3)`, boxShadow: `0 4px 12px ${col}40` }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{initials(p.name)}</span>
          </div>
          {p.isOnline && <div style={{ position: 'absolute', bottom: 2, right: 2, width: 11, height: 11, borderRadius: '50%', background: '#22C55E', border: '2px solid white' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: NAVY }}>{p.name}</span>
                {p.verified && <span style={{ fontSize: 9.5, background: 'rgba(34,139,84,.12)', color: '#1F7A4A', padding: '1px 6px', borderRadius: 20, fontWeight: 700 }}>✓ Verified</span>}
              </div>
              {p.specialties && p.specialties.length > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(10,22,40,.55)', marginTop: 2 }}>{p.specialties.join(' · ')}</div>
              )}
              {p.experience != null && (
                <div style={{ fontSize: 10.5, color: 'rgba(10,22,40,.4)', marginTop: 1 }}>{p.experience} yrs exp</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#7B2D8B' }}>{rateDisplay}</div>
            </div>
          </div>
          {p.rating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0' }}>
              <span style={{ color: GOLD, fontSize: 12 }}>★</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{p.rating}</span>
              {p.reviewCount != null && <span style={{ fontSize: 10.5, color: 'rgba(10,22,40,.45)' }}>({p.reviewCount.toLocaleString()} reviews)</span>}
            </div>
          )}
          <button onClick={() => router.push('/consult/' + p.id)} style={{
            width: '100%', padding: '9px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
            background: `linear-gradient(135deg,${GOLD},${GOLD2})`, color: NAVY,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Start Consultation
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton loader ── */
function ProviderSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ background: CARD, borderRadius: 18, height: 110, border: `1px solid rgba(200,146,10,.15)`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent 0%, rgba(200,146,10,.07) 50%, transparent 100%)`, animation: 'shimmer 1.5s infinite' }} />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   LIVE PROVIDER LIST — fetches from real API
   ════════════════════════════════════════════════════════ */
function LiveProviderList({ religion, serviceType, mode }: { religion: string; serviceType: 'offline'|'online'; mode: 'offline'|'online' }) {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map display religion key to API religion param
  const apiReligion = religion === 'muslim' ? 'islam' : religion;

  useEffect(() => {
    const token = tokenStore.access ?? '';
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/priests?religion=${apiReligion}&serviceType=${serviceType}&page=1&limit=20`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(json => {
        const list: ApiProvider[] = Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.providers) ? json.providers
          : Array.isArray(json) ? json
          : [];
        setProviders(list);
      })
      .catch(() => setError('Could not load providers. Please try again.'))
      .finally(() => setLoading(false));
  }, [religion, serviceType, apiReligion]);

  const clergLabel = religion === 'hindu' ? 'Pandits'
    : religion === 'muslim' ? 'Imams'
    : religion === 'sikh' ? 'Granthis'
    : religion === 'christian' ? 'Priests'
    : 'Priests';

  if (loading) return <ProviderSkeleton />;
  if (error) return (
    <div style={{ textAlign: 'center', padding: '24px 16px', color: 'rgba(10,22,40,.5)' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{error}</div>
    </div>
  );
  if (providers.length === 0) return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(10,22,40,.4)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
        No {clergLabel.toLowerCase()} available in your area yet. Check back soon.
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {mode === 'offline'
        ? providers.map((p: ApiProvider) => <ProviderCardOffline key={p.id} p={p} />)
        : providers.map((p: ApiProvider) => <ProviderCardOnline key={p.id} p={p} />)
      }
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   BOOK-A-GUIDE TAB
   ════════════════════════════════════════════════════════ */
function BookAGuideTab() {
  const [religion, setReligion] = useState<BookReligion | null>(null);
  const [selectedRitual, setSelectedRitual] = useState<Ritual | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const rituals: Ritual[]    = religion ? RITUALS[religion as BookReligion] : [];
  const categories: string[] = ['All', ...Array.from(new Set(rituals.map((r: Ritual) => r.category)))];
  const visibleRituals = categoryFilter === 'All' ? rituals : rituals.filter((r: Ritual) => r.category === categoryFilter);

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      {/* Choose Your Faith */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: religion ? `linear-gradient(135deg,${GOLD},${GOLD2})` : NAVY, color: religion ? NAVY : GOLD,
            fontSize: 11, fontWeight: 900,
          }}>
            {religion ? '✓' : '1'}
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: NAVY }}>Choose Your Faith</span>
          {!religion && (
            <span style={{ fontSize: 10, background: `rgba(200,146,10,.15)`, color: GOLD, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>Required</span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {BOOK_RELIGIONS.map(r => (
            <button key={r.key} onClick={() => { setReligion(r.key); setSelectedRitual(null); setCategoryFilter('All'); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 4px',
                borderRadius: 14, cursor: 'pointer',
                border: `2px solid ${religion === r.key ? r.accent : 'rgba(200,146,10,.2)'}`,
                background: religion === r.key ? `${r.accent}18` : CARD,
                transition: 'all .15s',
              }}>
              <span style={{ fontSize: 24 }}>{r.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: religion === r.key ? 800 : 500, color: religion === r.key ? r.accent : 'rgba(10,22,40,.55)' }}>
                {r.label}
              </span>
            </button>
          ))}
        </div>

        {!religion && (
          <div style={{ marginTop: 16, padding: 16, background: `rgba(200,146,10,.06)`, borderRadius: 14, border: `1.5px dashed rgba(200,146,10,.3)`, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🙏</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Choose your faith above</div>
            <div style={{ fontSize: 12, color: 'rgba(10,22,40,.55)', marginTop: 4 }}>
              Rituals, ceremonies &amp; service providers will appear based on your faith
            </div>
          </div>
        )}
      </div>

      {religion && (
        <>
          {/* Category tabs */}
          <SectionBanner title="Rituals & Ceremonies" />
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 12 }}>
            {categories.map((cat: string) => (
              <button key={cat} onClick={() => setCategoryFilter(cat)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 100, cursor: 'pointer',
                border: `1.5px solid ${categoryFilter === cat ? NAVY : 'rgba(200,146,10,.25)'}`,
                background: categoryFilter === cat ? NAVY : CARD,
                color: categoryFilter === cat ? GOLD : NAVY,
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>{cat}</button>
            ))}
          </div>

          {/* Ritual grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {visibleRituals.map((ritual: Ritual) => {
              const selected = selectedRitual?.id === ritual.id;
              return (
                <button key={ritual.id} onClick={() => setSelectedRitual(selected ? null : ritual)} style={{
                  textAlign: 'left', padding: 12, borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${selected ? GOLD : 'rgba(200,146,10,.2)'}`,
                  background: selected ? `rgba(200,146,10,.1)` : CARD,
                  boxShadow: selected ? `0 2px 12px rgba(200,146,10,.2)` : 'none',
                  transition: 'all .15s',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{ritual.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>{ritual.name}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(10,22,40,.5)', marginTop: 3 }}>{ritual.duration}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginTop: 4 }}>{paise(ritual.priceFrom)}+</div>
                  {selected && <div style={{ marginTop: 5, fontSize: 10, color: GOLD, fontWeight: 700 }}>✓ Selected</div>}
                </button>
              );
            })}
          </div>

          {/* Live Providers */}
          <SectionBanner title="Available Priests" />
          <LiveProviderList religion={religion} serviceType="offline" mode="offline" />
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ASTROLOGY FILTER SHEET
   ════════════════════════════════════════════════════════ */
function AstroFilterSheet({ filters, onApply, onClose }: { filters: AstroFilters; onApply: (f: AstroFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<AstroFilters>({ ...filters, skills: [...filters.skills], langs: [...filters.langs], offer: [...filters.offer], topOnly: [...filters.topOnly] });
  const [activeCategory, setActiveCategory] = useState<FilterCategoryKey>('sort');
  const cat = FILTER_CATEGORIES.find(c => c.key === activeCategory)!;

  const isSelected = (opt: string) => {
    if (cat.key === 'sort') return draft.sort === opt;
    if (cat.key === 'skill') return draft.skills.includes(opt);
    if (cat.key === 'language') return draft.langs.includes(opt);
    if (cat.key === 'gender') return draft.gender === opt;
    if (cat.key === 'country') return draft.country === opt;
    if (cat.key === 'offer') return draft.offer.includes(opt);
    if (cat.key === 'top') return draft.topOnly.includes(opt);
    return false;
  };

  const toggleOption = (opt: string) => {
    setDraft((prev: any) => {
      const d = { ...prev, skills: [...prev.skills], langs: [...prev.langs], offer: [...prev.offer], topOnly: [...prev.topOnly] };
      if (cat.key === 'sort') { d.sort = opt as SortOption; return d; }
      if (cat.key === 'gender') { d.gender = d.gender === opt ? '' : opt; return d; }
      if (cat.key === 'country') { d.country = d.country === opt ? '' : opt; return d; }
      const toggle = (arr: string[]) => arr.includes(opt) ? arr.filter((x: string) => x !== opt) : [...arr, opt];
      if (cat.key === 'skill') { d.skills = toggle(d.skills); return d; }
      if (cat.key === 'language') { d.langs = toggle(d.langs); return d; }
      if (cat.key === 'offer') { d.offer = toggle(d.offer); return d; }
      if (cat.key === 'top') { d.topOnly = toggle(d.topOnly); return d; }
      return d;
    });
  };

  const badge = (key: FilterCategoryKey): number => {
    if (key === 'sort') return draft.sort !== 'popularity' ? 1 : 0;
    if (key === 'skill') return draft.skills.length;
    if (key === 'language') return draft.langs.length;
    if (key === 'gender') return draft.gender ? 1 : 0;
    if (key === 'country') return draft.country ? 1 : 0;
    if (key === 'offer') return draft.offer.length;
    if (key === 'top') return draft.topOnly.length;
    return 0;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,22,40,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: CARD, borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(10,22,40,.2)', display: 'flex', flexDirection: 'column', maxHeight: '85svh', overflow: 'hidden' }}>
        <div style={{ background: NAVY, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: GOLD, fontFamily: "'Playfair Display',serif" }}>❮❮ Sort &amp; Filter ❯</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,250,237,.7)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 130, borderRight: `1px solid rgba(200,146,10,.15)`, overflowY: 'auto', flexShrink: 0, background: BG }}>
            {FILTER_CATEGORIES.map(c => {
              const active = activeCategory === c.key;
              const n = badge(c.key);
              return (
                <button key={c.key} onClick={() => setActiveCategory(c.key)} style={{
                  width: '100%', textAlign: 'left', padding: '14px 12px',
                  background: active ? CARD : 'transparent', border: 'none',
                  borderLeft: `3px solid ${active ? GOLD : 'transparent'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: active ? 800 : 500, color: active ? NAVY : 'rgba(10,22,40,.55)' }}>{c.label}</span>
                  {n > 0 && (
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: GOLD, color: NAVY, fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {cat.options.map(opt => {
              const sel = isSelected(opt.value);
              return (
                <button key={opt.value} onClick={() => toggleOption(opt.value)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', background: sel ? `rgba(200,146,10,.06)` : 'transparent',
                  border: 'none', cursor: 'pointer', borderBottom: `1px solid rgba(200,146,10,.08)`, textAlign: 'left', gap: 12,
                }}>
                  <span style={{ fontSize: 13.5, fontWeight: sel ? 700 : 400, color: sel ? NAVY : 'rgba(10,22,40,.7)' }}>{opt.label}</span>
                  {!cat.multi ? (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${sel ? GOLD : 'rgba(200,146,10,.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <div style={{ width: 10, height: 10, borderRadius: '50%', background: GOLD }} />}
                    </div>
                  ) : (
                    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${sel ? GOLD : 'rgba(200,146,10,.3)'}`, background: sel ? GOLD : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: `1px solid rgba(200,146,10,.15)`, display: 'flex', gap: 10, flexShrink: 0, background: CARD }}>
          <button onClick={() => setDraft({ ...DEFAULT_FILTERS })} style={{
            flex: 0, padding: '13px 18px', borderRadius: 14, border: `1.5px solid rgba(200,146,10,.3)`,
            background: 'transparent', color: GOLD, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Reset</button>
          <button onClick={() => { onApply(draft); onClose(); }} style={{
            flex: 1, padding: '13px', borderRadius: 14, border: 'none',
            background: `linear-gradient(135deg,${GOLD},${GOLD2})`, color: NAVY,
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}>Apply Filters</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ASTROLOGY TAB — links to /astrology page (no inline mock data)
   ════════════════════════════════════════════════════════ */
function AstrologyTab() {
  const router = useRouter();
  return (
    <div style={{ padding: '0 20px 24px' }}>
      {/* Hero banner */}
      <div style={{ borderRadius: 18, background: `linear-gradient(135deg,${NAVY} 0%,#2D1050 100%)`, padding: '18px 16px', position: 'relative', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(200,146,10,.08)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(200,146,10,.06)' }} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔮</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: "'Playfair Display',serif" }}>Talk to a Spiritual Consultant</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
          Chat or Call · Get answers in minutes · Starts at <strong style={{ color: GOLD }}>{formatPerMinute(1100)}</strong>
        </div>
        <button
          onClick={() => router.push('/astrology')}
          style={{ marginTop: 14, background: `linear-gradient(135deg,${GOLD},${GOLD2})`, color: NAVY, fontSize: 13, fontWeight: 900, padding: '10px 22px', borderRadius: 24, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(200,146,10,.4)' }}>
          Browse Consultants →
        </button>
      </div>

      {/* CTA cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { emoji: '🌙', title: 'Vedic Astrology', desc: 'Kundli, horoscope & Vedic guidance from certified Jyotishis' },
          { emoji: '🃏', title: 'Tarot Reading', desc: 'Past, present & future insights via tarot card reading' },
          { emoji: '🔢', title: 'Numerology', desc: 'Life path, destiny & name numerology analysis' },
          { emoji: '🏠', title: 'Vastu Shastra', desc: 'Home & office Vastu assessment for positive energy' },
        ].map(card => (
          <button key={card.title} onClick={() => router.push('/astrology')} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: CARD, borderRadius: 14, border: `1px solid rgba(200,146,10,.2)`,
            cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 8px rgba(10,22,40,.06)',
          }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{card.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{card.title}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(10,22,40,.55)', lineHeight: 1.4 }}>{card.desc}</div>
            </div>
            <span style={{ color: GOLD, fontSize: 18, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   FAITH CONFIG
   ════════════════════════════════════════════════════════ */
const FAITH_CONFIG = {
  hindu: {
    symbol: 'ॐ', symbolSize: 32, symbolFont: "Georgia,'Times New Roman',serif",
    clergy: 'Pandit',
    heroTitle: 'Hindu Rituals & Services',
    heroDesc: 'Puja, ceremonies & life events performed by verified Pandits at your home or venue',
    heroBg: '/priests/hindu-hero.jpg', heroBgFallback: 'https://images.unsplash.com/photo-1609151354155-43f6ba339de8?w=900&q=80',
    heroGrad: 'linear-gradient(180deg,rgba(6,4,2,.05) 0%,rgba(10,6,2,.45) 40%,rgba(10,6,2,.92) 100%)',
    iconBg: 'linear-gradient(135deg,#0A1628,#162B56)',
    iconColor: '#C8920A',
    pills: ['Puja & Havans','Weddings','Naming Ceremonies','Funerals','Griha Shanti','Vastu Shanti','• View More'],
    gridDesc: 'Pujas, rituals, havans & ceremonies',
    gridIcons: ['🪔','🏛️','👶','💍'],
    gridServices: ['Puja & Havan','Graha Shanti','Naming Ceremony','Wedding Ceremony'],
    verifiedLabel: 'Verified & Experienced Pandits',
    subCards: [
      { icon:'calendar', title:'Invite a Pandit / For Events', desc:'Invite a Pandit for your events, ceremonies or religious programs', img:'/priests/hindu-invite.jpg', imgFallback:'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400&q=70', serviceType: 'offline' as const },
      { icon:'chat', title:'Ask a Pandit', desc:'Get answers to your religious questions from experienced and trusted Pandits', img:'/priests/hindu-ask.jpg', imgFallback:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=70', serviceType: 'online' as const },
    ],
  },
  muslim: {
    symbol: '☪', symbolSize: 28, symbolFont: 'inherit',
    clergy: 'Imam',
    heroTitle: 'Muslim Rituals & Services',
    heroDesc: 'Book trusted Imams for prayers, ceremonies and religious services at your home or venue',
    heroBg: '/priests/muslim-hero.jpg',
    heroBgFallback: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&q=80',
    heroGrad: 'linear-gradient(180deg,rgba(2,8,4,.05) 0%,rgba(2,12,6,.45) 40%,rgba(2,12,6,.92) 100%)',
    iconBg: 'linear-gradient(135deg,#06200E,#0F3D1E)',
    iconColor: '#4CAF78',
    pills: ['Namaz & Dua','Nikah','Aqiqah','Jumu\'ah Khutbah','Ramadan Services','Funerals (Janazah)','Quran Recitation','Islamic Events','• View More'],
    gridDesc: 'Namaz services, dua, Nikah & other rituals',
    gridIcons: ['🙏','🤲','💍','🌿'],
    gridServices: ['Namaz Guidance','Dua & Wazifa','Nikah Service','Janaza Service'],
    verifiedLabel: 'Verified & Experienced Imams',
    subCards: [
      { icon:'calendar', title:'Invite an Imam / For Events', desc:'Invite an Imam for your events, ceremonies or religious programs', img:'/priests/muslim-invite.jpg', imgFallback:'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=400&q=70', serviceType: 'offline' as const },
      { icon:'chat', title:'Ask an Imam', desc:'Get answers to your Islamic questions from experienced and trusted Imams', img:'/priests/muslim-ask.jpg', imgFallback:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=70', serviceType: 'online' as const },
    ],
  },
  sikh: {
    symbol: '☬', symbolSize: 26, symbolFont: 'inherit',
    clergy: 'Granthi',
    heroTitle: 'Sikh Rituals & Services',
    heroDesc: 'Gurbani, path and other Sikh services performed by verified Granthis at your home or venue',
    heroBg: '/priests/sikh-hero.jpg',
    heroBgFallback: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=900&q=80',
    heroGrad: 'linear-gradient(180deg,rgba(4,4,2,.05) 0%,rgba(8,6,2,.45) 40%,rgba(8,6,2,.92) 100%)',
    iconBg: 'linear-gradient(135deg,#1A0A02,#3D1E06)',
    iconColor: '#E8A030',
    pills: ['Akhand Path Sahib','Sukhmani Sahib Path','Japji Sahib Path','Anand Karaj (Marriage)','Naam Karan (Naming)','Antim Ardas (Funeral)','Gurbani Path','Griha Pravesh','• View More'],
    gridDesc: 'Gurbani, path & Sikh ceremonies',
    gridIcons: ['📖','🙏','💍','🌿'],
    gridServices: ['Gurbani Path','Ardas Seva','Anand Karaj (Marriage)','Antim Ardas'],
    verifiedLabel: 'Verified & Experienced Granthis',
    subCards: [
      { icon:'calendar', title:'Invite a Granthi / For Events', desc:'Invite a Granthi for your events, ceremonies or religious programs', img:'/priests/sikh-invite.jpg', imgFallback:'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&q=70', serviceType: 'offline' as const },
      { icon:'chat', title:'Ask a Granthi', desc:'Get answers to your Sikh faith and religious questions from experienced Granthis', img:'/priests/sikh-ask.jpg', imgFallback:'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&q=70', serviceType: 'online' as const },
    ],
  },
  christian: {
    symbol: '✝', symbolSize: 26, symbolFont: 'inherit',
    clergy: 'Father',
    heroTitle: 'Christian Services',
    heroDesc: 'Mass, prayers, sacraments and other Christian services performed by verified priests at your home or venue',
    heroBg: '/priests/christian-hero.jpg',
    heroBgFallback: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=900&q=80',
    heroGrad: 'linear-gradient(180deg,rgba(4,2,10,.05) 0%,rgba(6,4,16,.45) 40%,rgba(6,4,16,.92) 100%)',
    iconBg: 'linear-gradient(135deg,#160830,#2A1060)',
    iconColor: '#A080E0',
    pills: ['Holy Mass','Wedding','Baptism','Funeral Service','House Blessing','Confession','First Communion','Confirmation','• View More'],
    gridDesc: 'Mass, prayers, sacraments & life events',
    gridIcons: ['🍷','🙏','💍','💧'],
    gridServices: ['Holy Mass / Eucharist','Prayer Service','Wedding Service','Baptism Service'],
    verifiedLabel: 'Verified & Experienced Priests',
    subCards: [
      { icon:'calendar', title:'Invite a Priest / For Events', desc:'Invite a priest for your events, ceremonies or religious programs', img:'/priests/christian-invite.jpg', imgFallback:'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=400&q=70', serviceType: 'offline' as const },
      { icon:'chat', title:'Ask a Priest', desc:'Get answers to your Christian faith questions from experienced priests', img:'/priests/christian-ask.jpg', imgFallback:'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=400&q=70', serviceType: 'online' as const },
    ],
  },
};

const GRID_FAITHS = [
  { key:'hindu',    label:'Hindu',    symbol:'ॐ', symFont:"Georgia,serif", symSize:34, bg:'/priests/hindu-hero.jpg', iconBg:'#0A1628', iconColor:'#C8920A', grad:'linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(6,4,0,.82) 100%)' },
  { key:'muslim',   label:'Muslim',   symbol:'☪', symFont:'inherit',       symSize:28, bg:'/priests/muslim-hero.jpg', bgFallback:'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=75', iconBg:'#062010', iconColor:'#4CAF78', grad:'linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(2,12,6,.82) 100%)' },
  { key:'sikh',     label:'Sikh',     symbol:'☬', symFont:'inherit',       symSize:24, bg:'/priests/sikh-hero.jpg', bgFallback:'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=500&q=75',    iconBg:'#1A0A02', iconColor:'#E8A030', grad:'linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(8,4,0,.82) 100%)' },
  { key:'christian',label:'Christian',symbol:'✝', symFont:'inherit',       symSize:26, bg:'/priests/christian-hero.jpg', bgFallback:'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=500&q=75', iconBg:'#160828', iconColor:'#A080E0', grad:'linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(6,2,14,.82) 100%)' },
];

/* ════════════════════════════════════════════════════════
   MAIN SCREEN
   ════════════════════════════════════════════════════════ */
type PriestScreen = 'landing' | 'booking' | 'astrology' | 'priest-journey';

function SpiritualGuidesInner() {
  const { religion, confirmReligion, loaded } = useReligion();
  const params = useSearchParams();
  const router = useRouter();
  const [screen, setScreen] = useState<PriestScreen>('landing');
  const [viewingFaith, setViewingFaith] = useState<string | null>(null);
  const [priestMode, setPriestMode] = useState<'invite'|'online'>('invite');
  const [priestFaith, setPriestFaith] = useState<string>('all');
  // Which sub-card is being viewed inside FaithView (for live provider list)
  const [activeServiceType, setActiveServiceType] = useState<'offline'|'online'|null>(null);

  useEffect(() => {
    const t = params?.get('tab');
    if (t === 'astrology') setScreen('astrology');
  }, [params]);

  /* ─ Sticky header ─ */
  function Header({ back }: { back?: boolean }) {
    const titleMap: Record<string, string> = {
      landing: 'Priests', booking: 'Book Priest / Rituals', astrology: 'Spiritual Consultancy',
    };
    return (
      <div style={{
        position:'sticky', top:0, zIndex:30,
        background:'#0A1628',
        padding:'0 20px',
        boxShadow:'0 2px 16px rgba(0,0,0,.35)',
      }}>
        <div style={{ display:'flex', alignItems:'center', height:56 }}>
          {back && (
            <button onClick={() => setScreen('landing')} style={{ background:'none', border:'none', cursor:'pointer', color:GOLD2, fontSize:22, padding:'0 8px 0 0', lineHeight:1 }}>‹</button>
          )}
          <span style={{ flex:1, fontSize:17, fontWeight:900, color:GOLD2, fontFamily:"'Playfair Display',Georgia,serif", letterSpacing:0.5, textAlign:'center' }}>
            {titleMap[screen]}
          </span>
        </div>
        <div style={{ height:2, background:`linear-gradient(90deg,transparent,${GOLD},transparent)`, marginBottom:0 }} />
      </div>
    );
  }

  /* ─ Sub-service card (horizontal) ─ */
  function SubCard({ icon, title, desc, img, imgFallback, serviceType, onPress }: {
    icon:string; title:string; desc:string; img:string; imgFallback?:string;
    serviceType: 'offline'|'online'; onPress?:()=>void
  }) {
    return (
      <button onClick={onPress} style={{
        borderRadius:18, overflow:'hidden', border:`1.5px solid rgba(200,146,10,.25)`,
        background:'#0B1A30', display:'flex', height:130, marginBottom:14,
        boxShadow:'0 6px 24px rgba(0,0,0,.4)',
        position:'relative', cursor:'pointer', width:'100%', padding:0, textAlign:'left',
      }}>
        <img
          src={img} alt=""
          onError={imgFallback ? (e:any)=>{(e.target as HTMLImageElement).src=imgFallback} : undefined}
          style={{ position:'absolute', right:0, top:0, width:'55%', height:'100%', objectFit:'cover', display:'block' }}
        />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#0B1A30 42%,rgba(11,26,48,.7) 65%,rgba(11,26,48,.15) 100%)' }} />
        <div style={{ position:'relative', zIndex:2, flex:1, padding:'16px 16px', display:'flex', flexDirection:'column', justifyContent:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:52, height:52, borderRadius:14, flexShrink:0,
              background:'#0D1830', border:'1.5px solid rgba(200,146,10,.5)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              {icon === 'calendar' ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="#C8920A" strokeWidth="1.7"/>
                  <line x1="3" y1="9" x2="21" y2="9" stroke="#C8920A" strokeWidth="1.7"/>
                  <line x1="8" y1="2" x2="8" y2="6" stroke="#C8920A" strokeWidth="1.7" strokeLinecap="round"/>
                  <line x1="16" y1="2" x2="16" y2="6" stroke="#C8920A" strokeWidth="1.7" strokeLinecap="round"/>
                  <rect x="6.5" y="12" width="2.8" height="2.8" rx="0.6" fill="#C8920A"/>
                  <rect x="10.6" y="12" width="2.8" height="2.8" rx="0.6" fill="#C8920A"/>
                  <rect x="14.7" y="12" width="2.8" height="2.8" rx="0.6" fill="#C8920A"/>
                  <rect x="6.5" y="16" width="2.8" height="2.8" rx="0.6" fill="#C8920A"/>
                  <rect x="10.6" y="16" width="2.8" height="2.8" rx="0.6" fill="#C8920A"/>
                </svg>
              ) : icon === 'chat' ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 2H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3l3 3 3-3h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" stroke="#C8920A" strokeWidth="1.7" strokeLinejoin="round"/>
                  <line x1="7" y1="8" x2="17" y2="8" stroke="#C8920A" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="7" y1="12" x2="14" y2="12" stroke="#C8920A" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <span style={{ fontSize:24 }}>{icon}</span>
              )}
            </div>
            <span style={{ fontSize:16, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.2 }}>{title}</span>
          </div>
          <p style={{ fontSize:11.5, color:'rgba(245,230,192,.65)', margin:0, lineHeight:1.45, maxWidth:'62%' }}>{desc}</p>
        </div>
        <div style={{ position:'absolute', zIndex:3, bottom:14, right:14 }}>
          <span style={{ background:`linear-gradient(90deg,${GOLD},${GOLD2})`, color:NAVY, fontSize:12, fontWeight:900, padding:'8px 18px', borderRadius:20, whiteSpace:'nowrap', boxShadow:'0 3px 12px rgba(200,146,10,.4)' }}>Explore →</span>
        </div>
      </button>
    );
  }

  /* ─ Faith-specific hero view ─ */
  function FaithView({ faithKey }: { faithKey: string }) {
    const cfg = FAITH_CONFIG[faithKey as keyof typeof FAITH_CONFIG];
    if (!cfg) return null;
    return (
      <div style={{ padding:'16px 14px 24px' }}>
        {/* Hero card */}
        <div style={{ borderRadius:20, overflow:'hidden', position:'relative', marginBottom:14, boxShadow:'0 8px 32px rgba(0,0,0,.45)' }}>
          <img src={cfg.heroBg} alt="" onError={(e:any)=>{const fb=(cfg as any).heroBgFallback; if(fb)(e.target as HTMLImageElement).src=fb}} style={{ width:'100%', height:320, objectFit:'cover', display:'block' }} />
          <div style={{ position:'absolute', inset:0, background:cfg.heroGrad }} />
          <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 16px 18px' }}>
            <div style={{
              width:64, height:64, borderRadius:16, marginBottom:10,
              background:cfg.iconBg, border:`2px solid rgba(200,146,10,.4)`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{ fontSize:cfg.symbolSize, fontWeight:900, color:cfg.iconColor, fontFamily:cfg.symbolFont, lineHeight:1 }}>{cfg.symbol}</span>
            </div>
            <h2 style={{ margin:'0 0 6px', fontSize:24, fontWeight:900, color:'#FFFFFF', fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1.2, textShadow:'0 2px 12px rgba(0,0,0,.9),0 0 30px rgba(200,146,10,.35)' }}>{cfg.heroTitle}</h2>
            <p style={{ margin:'0 0 16px', fontSize:12, color:'rgba(245,230,192,.75)', lineHeight:1.5 }}>{cfg.heroDesc}</p>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, color:'rgba(245,230,192,.55)', fontWeight:500 }}>Book in minutes</span>
              <button onClick={() => setScreen('booking')} style={{ background:`linear-gradient(90deg,${GOLD},${GOLD2})`, color:NAVY, fontSize:13, fontWeight:900, padding:'10px 22px', borderRadius:24, border:'none', cursor:'pointer', boxShadow:'0 4px 14px rgba(200,146,10,.4)' }}>
                Explore →
              </button>
            </div>
          </div>
        </div>

        {/* Sub-service cards */}
        {cfg.subCards.map(c => (
          <SubCard key={c.title} {...c} onPress={() => {
            setPriestFaith(faithKey);
            setPriestMode(c.serviceType === 'offline' ? 'invite' : 'online');
            setActiveServiceType(c.serviceType);
            setScreen('priest-journey');
          }} />
        ))}

        {/* Live provider sections */}
        {activeServiceType && (
          <div style={{ marginTop: 8 }}>
            <SectionBanner
              title={activeServiceType === 'offline'
                ? `Invite a ${cfg.clergy} — Available Near You`
                : `Ask a ${cfg.clergy} — Online Consultation`}
            />
            <LiveProviderList religion={faithKey} serviceType={activeServiceType} mode={activeServiceType} />
          </div>
        )}
      </div>
    );
  }

  /* ─ All-faiths 2×2 grid ─ */
  function AllFaithsView() {
    return (
      <div style={{ padding:'0 0 24px', background:'#F5E6C0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'16px 16px 16px' }}>
          <div style={{ flex:1, height:1, background:`rgba(200,146,10,.4)` }} />
          <span style={{ fontSize:13, fontWeight:700, color:NAVY, letterSpacing:0.4 }}>Choose your faith to get started</span>
          <div style={{ flex:1, height:1, background:`rgba(200,146,10,.4)` }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'0 10px' }}>
          {GRID_FAITHS.map(f => {
            const cfg = FAITH_CONFIG[f.key as keyof typeof FAITH_CONFIG];
            return (
              <button key={f.key} onClick={() => setViewingFaith(f.key)} style={{
                border:'none', cursor:'pointer', padding:0,
                borderRadius:20, overflow:'hidden', position:'relative',
                display:'block', textAlign:'left',
                boxShadow:'0 8px 28px rgba(0,0,0,.35)',
              }}>
                <img
                  src={f.bg} alt={f.label}
                  onError={(f as any).bgFallback ? (e:any)=>{(e.target as HTMLImageElement).src=(f as any).bgFallback} : undefined}
                  style={{ width:'100%', height:300, objectFit:'cover', display:'block' }}
                />
                <div style={{ position:'absolute', inset:0, background:f.grad }} />
                <div style={{
                  position:'absolute', top:14, left:14,
                  width:62, height:62, borderRadius:'50%',
                  background:f.iconBg,
                  border:`2.5px solid ${GOLD}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow:`0 0 16px rgba(200,146,10,.4)`,
                }}>
                  <span style={{ fontSize:f.symSize, fontWeight:900, color:f.iconColor, fontFamily:f.symFont, lineHeight:1 }}>{f.symbol}</span>
                </div>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px 12px 14px' }}>
                  <div style={{ fontSize:22, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',Georgia,serif", lineHeight:1, marginBottom:4 }}>{f.label}</div>
                  <div style={{ fontSize:11, color:'rgba(245,230,192,.8)', lineHeight:1.35, marginBottom:14 }}>{cfg?.gridDesc}</div>
                  <div style={{ fontSize:9.5, color:'rgba(245,230,192,.7)', fontWeight:600, lineHeight:1.3, marginBottom:8 }}>✓ {cfg?.verifiedLabel}</div>
                  <div style={{ display:'flex', justifyContent:'flex-end' }}>
                    <span style={{
                      background:`linear-gradient(90deg,${GOLD},${GOLD2})`,
                      color:NAVY, fontSize:12, fontWeight:800,
                      padding:'8px 20px', borderRadius:20,
                      whiteSpace:'nowrap',
                      boxShadow:'0 3px 10px rgba(200,146,10,.4)',
                    }}>Explore →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─ Astrology promo card ─ */
  function AstroCard() {
    return (
      <button onClick={() => setScreen('astrology')} style={{
        width:'100%', border:'none', cursor:'pointer', textAlign:'left',
        borderRadius:18, padding:0, overflow:'hidden',
        boxShadow:'0 6px 24px rgba(10,22,40,.35)', display:'block',
        position:'relative', height:100,
        background:'linear-gradient(135deg,#06101E 0%,#0E1F3D 50%,#162B56 100%)',
      }}>
        <img
          src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&q=80"
          alt="Spiritual Consultancy"
          onError={(e:any)=>{(e.target as HTMLImageElement).style.opacity='0'}}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', display:'block', objectPosition:'center 30%' }}
        />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,rgba(6,10,30,.9) 0%,rgba(6,10,30,.75) 55%,rgba(6,10,30,.35) 100%)' }} />
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${GOLD},${GOLD2},${GOLD})` }} />
        <div style={{ position:'absolute', inset:0, padding:'0 18px', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:14, flexShrink:0, background:'rgba(200,146,10,.15)', border:`1.5px solid rgba(200,146,10,.5)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>🧘</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',Georgia,serif", marginBottom:2 }}>Spiritual Consultancy</div>
            <div style={{ fontSize:11, color:'rgba(245,230,192,.65)' }}>Live consultations · Starting {formatPerMinute(1000)}</div>
          </div>
          <span style={{ background:`linear-gradient(90deg,${GOLD},${GOLD2})`, color:NAVY, fontSize:12, fontWeight:800, padding:'8px 16px', borderRadius:18, flexShrink:0, whiteSpace:'nowrap', boxShadow:'0 3px 10px rgba(200,146,10,.4)' }}>Consult →</span>
        </div>
      </button>
    );
  }

  /* ─ Render ─ */
  if (!loaded) return <div style={{ minHeight:'100svh', background:'#0A1628' }} />;
  if (religion === null) return <ReligionPicker onConfirm={confirmReligion} />;

  if (screen === 'priest-journey') return (
    <PriestJourneyScreen
      mode={priestMode}
      religion={priestFaith}
      onBack={() => { setScreen('landing'); }}
    />
  );
  if (screen === 'booking')   return <div style={{ background:BG, minHeight:'100dvh', paddingBottom:80 }}><Header back /><BookAGuideTab /></div>;
  if (screen === 'astrology') return <div style={{ background:BG, minHeight:'100dvh', paddingBottom:80 }}><Header back /><AstrologyTab /></div>;

  const rel = religion as string;
  const isFaith = rel === 'hindu' || rel === 'muslim' || rel === 'sikh' || rel === 'christian';

  const activeFaith = viewingFaith ?? (isFaith ? rel : null);

  if (activeFaith) {
    return (
      <div style={{ minHeight:'100dvh', paddingBottom:80, background:'#0A1628' }}>
        <div style={{ position:'sticky', top:0, zIndex:100, background:'#0A1628', borderBottom:'1px solid rgba(200,146,10,.15)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'14px 16px', position:'relative' }}>
            <button onClick={() => { setViewingFaith(null); setActiveServiceType(null); }} style={{ position:'absolute', left:16, background:'none', border:'none', cursor:'pointer', color:GOLD2, fontSize:22, padding:'0 8px 0 0', lineHeight:1 }}>‹</button>
            <span style={{ fontSize:18, fontWeight:900, color:GOLD, fontFamily:"'Playfair Display',Georgia,serif" }}>Priests</span>
          </div>
        </div>
        <FaithView faithKey={activeFaith} />
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100dvh', paddingBottom:80, background:'#F5E6C0' }}>
      <Header />
      <AllFaithsView />
    </div>
  );
}

export default function SpiritualGuidesScreen() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', background: '#F5E6C0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid rgba(200,146,10,0.2)', borderTopColor: '#C8920A', borderRadius: '50%' }} />
      </div>
    }>
      <SpiritualGuidesInner />
    </Suspense>
  );
}
