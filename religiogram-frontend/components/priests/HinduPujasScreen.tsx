'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const NAVY   = '#0A1628';
const NAVY_2 = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFF8E7';
const TEXT   = '#1A0800';
const TEXT2  = '#4A3010';
const TEXT3  = '#8B6B35';

// ── EXACT data mirroring the design spec ──────────────────────────────────
// Keep ritual names, durations, market price ranges and starting prices
// EXACTLY as in the approved mockup. Edit any of these only after product sign-off.
interface PujaCard {
  name: string;
  duration: string;
  marketLo: number;
  marketHi: number;
  startingFrom: number;
  /** Image lives at /priests/hindu/rituals/<slug>.jpg — drop your real assets there. */
  image: string;
}

function ritualImg(slug: string): string {
  return `/priests/hindu/rituals/${slug}.jpg`;
}

interface PujaSection {
  num: number;
  title: string;
  items: PujaCard[];
}

const SECTIONS: PujaSection[] = [
  {
    num: 1, title: 'Daily / Basic Rituals',
    items: [
      { name: 'Ganesh Puja',         duration: '30–45 min', marketLo: 800,   marketHi: 1500,  startingFrom: 1199, image: ritualImg('ganesh-puja') },
      { name: 'Lakshmi Puja',        duration: '45–60 min', marketLo: 1200,  marketHi: 2500,  startingFrom: 1799, image: ritualImg('lakshmi-puja') },
      { name: 'Satyanarayan Katha',  duration: '1.5–2 hrs', marketLo: 2500,  marketHi: 6000,  startingFrom: 3999, image: ritualImg('satyanarayan-katha') },
      { name: 'Daily Ghar Puja',     duration: '20–30 min', marketLo: 500,   marketHi: 1200,  startingFrom: 899, image: ritualImg('daily-ghar-puja') },
      { name: 'Tulsi Vivah',         duration: '1–2 hrs',   marketLo: 2000,  marketHi: 5000,  startingFrom: 3499, image: ritualImg('tulsi-vivah') },
    ],
  },
  {
    num: 2, title: 'Festival-Based Pujas',
    items: [
      { name: 'Diwali Lakshmi Puja',   duration: '1–2 hrs', marketLo: 2500, marketHi: 7000, startingFrom: 4999, image: ritualImg('diwali-lakshmi-puja') },
      { name: 'Navratri Durga Puja',   duration: '1–2 hrs', marketLo: 3000, marketHi: 8000, startingFrom: 5499, image: ritualImg('navratri-durga-puja') },
      { name: 'Ganesh Chaturthi Puja', duration: '1–2 hrs', marketLo: 2000, marketHi: 6000, startingFrom: 3999, image: ritualImg('ganesh-chaturthi-puja') },
      { name: 'Karwa Chauth Puja',     duration: '1 hr',    marketLo: 1500, marketHi: 4000, startingFrom: 2499, image: ritualImg('karwa-chauth-puja') },
      { name: 'Makar Sankranti Puja',  duration: '1 hr',    marketLo: 1000, marketHi: 3000, startingFrom: 1999, image: ritualImg('makar-sankranti-puja') },
    ],
  },
  {
    num: 3, title: 'Dosha / Problem-Solving Pujas',
    items: [
      { name: 'Navgraha Shanti Puja', duration: '2–3 hrs',   marketLo: 5000,  marketHi: 15000, startingFrom: 8999, image: ritualImg('navgraha-shanti-puja') },
      { name: 'Kaal Sarp Dosh Puja',  duration: '2–4 hrs',   marketLo: 7000,  marketHi: 25000, startingFrom: 12999, image: ritualImg('kaal-sarp-dosh-puja') },
      { name: 'Mangal Dosh Puja',     duration: '1.5–2 hrs', marketLo: 4000,  marketHi: 12000, startingFrom: 7999, image: ritualImg('mangal-dosh-puja') },
      { name: 'Vastu Shanti Puja',    duration: '2–3 hrs',   marketLo: 6000,  marketHi: 20000, startingFrom: 9999, image: ritualImg('vastu-shanti-puja') },
      { name: 'Rahu-Ketu Shanti',     duration: '4–8 hrs',   marketLo: 4000,  marketHi: 12000, startingFrom: 7499, image: ritualImg('rahu-ketu-shanti') },
    ],
  },
  {
    num: 4, title: 'Life Events / Sanskar Pujas',
    items: [
      { name: 'Griha Pravesh Puja',     duration: '2–4 hrs', marketLo: 6000,  marketHi: 25000, startingFrom: 10999, image: ritualImg('griha-pravesh-puja') },
      { name: 'Naamkaran (Naming)',     duration: '1–2 hrs', marketLo: 3000,  marketHi: 10000, startingFrom: 5999, image: ritualImg('naamkaran') },
      { name: 'Mundan Ceremony',        duration: '1–2 hrs', marketLo: 3000,  marketHi: 12000, startingFrom: 6499, image: ritualImg('mundan') },
      { name: 'Annaprashan',            duration: '2–3 hrs', marketLo: 3000,  marketHi: 8000,  startingFrom: 5499, image: ritualImg('annaprashan') },
      { name: 'Wedding Ritual (Pandit)',duration: '4–8 hrs', marketLo: 15000, marketHi: 50000, startingFrom: 24999, image: ritualImg('wedding-ritual') },
    ],
  },
  {
    num: 5, title: 'Online / Digital Pujas',
    items: [
      { name: 'Online Puja (Basic)',     duration: '30–60 min', marketLo: 500,  marketHi: 1500, startingFrom: 999, image: ritualImg('online-puja-basic') },
      { name: 'Live Temple Puja',        duration: '30–60 min', marketLo: 1000, marketHi: 3000, startingFrom: 1999, image: ritualImg('live-temple-puja') },
      { name: 'Astrology + Puja Combo',  duration: '30–45 min', marketLo: 1500, marketHi: 5000, startingFrom: 2999, image: ritualImg('astrology-puja-combo') },
    ],
  },
];

const TABS = [
  { key: 'all',       label: 'All Services',  icon: '⊞'  },
  { key: 'daily',     label: 'Daily Rituals', icon: '🪔' },
  { key: 'festival',  label: 'Festival Pujas',icon: '🎉' },
  { key: 'dosha',     label: 'Shanti / Dosha',icon: '🔱' },
  { key: 'sanskar',   label: 'Sanskar',       icon: '👶' },
  { key: 'online',    label: 'Online Pujas',  icon: '📡' },
];

function rupees(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

function PujaTile({ item }: { item: PujaCard }) {
  const router = useRouter();
  const goBook = () =>
    router.push(`/priests/invite?faith=hindu&ceremony=${encodeURIComponent(item.name)}`);
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(200,146,10,0.20)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 2px 8px rgba(60,30,5,0.06)',
    }}>
      {/* Image area — portrait aspect so source illustrations (which are
          taller than wide) can fill the tile via cover without losing the
          deity face. Falls back to a warm gradient with diya emoji if the
          file at item.image doesn't exist yet. */}
      <div style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        width: '100%',
        background: 'linear-gradient(160deg,#3D1E08 0%,#6B3210 60%,#C8920A 100%)',
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image}
          alt={item.name}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            // Anchor a touch above center so the deity's face/crown stay
            // visible when a portrait source gets cropped vertically.
            objectPosition: 'center 30%',
            display: 'block',
          }}
          loading="lazy"
          decoding="async"
          width={400}
          height={400}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
        }}>
          🪔
        </div>
      </div>
      <div style={{ padding: '10px 10px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: TEXT,
          lineHeight: 1.25,
          fontFamily: '"Plus Jakarta Sans",sans-serif',
        }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: TEXT3, fontSize: 10 }}>
          <span style={{ display: 'inline-flex', width: 11, height: 11, borderRadius: '50%', border: `1px solid ${GOLD}`, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 1, height: 4, background: GOLD, transform: 'translate(0, -1px)' }} />
          </span>
          <span>{item.duration}</span>
        </div>
        <div>
          <div style={{ fontSize: 9, color: TEXT3, marginTop: 2 }}>Market Price</div>
          <div style={{ fontSize: 10, color: TEXT2, fontWeight: 600 }}>
            {rupees(item.marketLo)} – {rupees(item.marketHi)}
          </div>
        </div>
        <div style={{ marginTop: 2 }}>
          <div style={{ fontSize: 9, color: TEXT3 }}>Starting from</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#7A1F1F', fontFamily: '"Playfair Display",Georgia,serif' }}>
            {rupees(item.startingFrom)}
          </div>
        </div>
        <button
          onClick={goBook}
          style={{
            marginTop: 4,
            width: '100%',
            background: GOLD_L, color: NAVY_2,
            fontSize: 10.5, fontWeight: 800,
            padding: '7px 0', borderRadius: 8,
            border: 'none', cursor: 'pointer',
          }}
        >
          Book Now
        </button>
      </div>
    </div>
  );
}

export default function HinduPujasScreen() {
  const router = useRouter();
  const [tab, setTab] = useState('all');

  const visibleSections = (() => {
    if (tab === 'all')      return SECTIONS;
    if (tab === 'daily')    return SECTIONS.filter(s => s.num === 1);
    if (tab === 'festival') return SECTIONS.filter(s => s.num === 2);
    if (tab === 'dosha')    return SECTIONS.filter(s => s.num === 3);
    if (tab === 'sanskar')  return SECTIONS.filter(s => s.num === 4);
    if (tab === 'online')   return SECTIONS.filter(s => s.num === 5);
    return SECTIONS;
  })();

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        backgroundImage: `linear-gradient(135deg, rgba(10,22,40,0.78) 0%, rgba(26,36,56,0.55) 40%, rgba(42,24,8,0.30) 100%), url('/hindu-services-hero.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: NAVY,
        padding: '14px 16px 20px',
        color: '#fff', overflow: 'hidden',
        minHeight: 260,
      }}>
        {/* Back button */}
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginBottom: 10,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Title */}
        <div style={{
          fontSize: 32, fontWeight: 700, lineHeight: 1.05,
          fontFamily: '"Playfair Display",Georgia,serif', color: '#fff',
        }}>
          Hindu
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, lineHeight: 1.05,
          fontFamily: '"Playfair Display",Georgia,serif', color: GOLD_L,
          marginBottom: 10,
        }}>
          Puja Services
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em', marginBottom: 14 }}>
          Authentic Rituals • Experienced Pandits • Peace &amp; Prosperity
        </div>

        {/* Trust badges (Verified Pandits / 10+ Years / 100% Trusted) removed per product decision. */}
      </div>

      {/* 3 alert cards (Festive slots / Only 3 pandits / On-time) removed per product decision. */}

      {/* ── TAB PILLS ────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 14px 10px', overflowX: 'auto', scrollbarWidth: 'none', background: CREAM }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flexShrink: 0,
                background: active ? NAVY_2 : '#fff',
                color: active ? '#fff' : TEXT2,
                border: `1px solid ${active ? NAVY_2 : 'rgba(200,146,10,0.30)'}`,
                fontSize: 11, fontWeight: 700,
                padding: '7px 12px', borderRadius: 18,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECTIONS ─────────────────────────────────────────────────── */}
      {/* Each section sits inside a cream-bordered container so the
          structure mirrors the design composition (gold-edged card per
          numbered group, with rituals as white tiles inside). */}
      {visibleSections.map(sec => (
        <div key={sec.num} style={{
          margin: '14px 12px 0',
          background: '#FFFCF1',
          border: '1px solid rgba(200,146,10,0.32)',
          borderRadius: 14,
          padding: '14px 10px 12px',
          boxShadow: '0 2px 10px rgba(60,30,5,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 4px' }}>
            <span style={{
              fontSize: 16, fontWeight: 800, color: TEXT,
              fontFamily: '"Playfair Display",Georgia,serif',
            }}>
              {sec.num}. {sec.title}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(200,146,10,0.35)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {sec.items.map(item => (
              <PujaTile key={item.name} item={item} />
            ))}
          </div>
        </div>
      ))}

      {/* Bottom trust bar (Verified / 4.8+ Rating / Customer Support / Secure Payments) removed per product decision. */}
    </div>
  );
}
