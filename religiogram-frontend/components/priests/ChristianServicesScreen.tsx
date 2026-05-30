'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

const NAVY    = '#0A1628';
const NAVY_2  = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFF8E7';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';
const PRICE   = '#7A1F1F';

// ── EXACT data from approved mockup ──────────────────────────────────────
// Service names, durations, price ranges and ratings reviewed for accuracy.
// Edit only after product sign-off.

interface BookableService {
  badge?: string;
  ico: string;
  name: string;
  subtitle: string;
  duration: string;
  priceLo: number;
  priceHi: number;
  /** Drop your real image at /priests/christian/services/<slug>.jpg. */
  image: string;
}
function christianSvcImg(slug: string): string {
  return `/priests/christian/services/${slug}.jpg`;
}
const MOST_BOOKED: BookableService[] = [
  {                       ico: '💧', name: 'Baptism Ceremony',        subtitle: 'Infant or adult baptism',          duration: '45–60 mins', priceLo: 2000, priceHi: 6000,  image: christianSvcImg('baptism-ceremony') },
  { badge: 'Most Booked', ico: '💍', name: 'Christian Wedding',       subtitle: 'Church or destination wedding',    duration: '1–2 hrs',    priceLo: 8000, priceHi: 25000, image: christianSvcImg('christian-wedding') },
  {                       ico: '✝',  name: 'Funeral / Last Rites',    subtitle: 'Burial service with prayers',      duration: '1–2 hrs',    priceLo: 5000, priceHi: 15000, image: christianSvcImg('funeral-last-rites') },
  {                       ico: '🍷', name: 'Holy Communion (Private)',subtitle: 'Home Eucharist for elderly or sick',duration: '30–45 mins', priceLo: 1500, priceHi: 4000,  image: christianSvcImg('holy-communion') },
];

interface SimpleService {
  ico: string; name: string; duration: string; priceLo: number; priceHi: number;
  /** Drop your real image at /priests/christian/services/<slug>.jpg. */
  image: string;
}
const HOUSE_BLESSINGS: SimpleService[] = [
  { ico: '🏠', name: 'House Blessing',             duration: '30–60 mins', priceLo: 2000, priceHi: 5000, image: christianSvcImg('house-blessing') },
  { ico: '🙏', name: 'Family Prayer Service',      duration: '45 mins',    priceLo: 1500, priceHi: 4000, image: christianSvcImg('family-prayer-service') },
  { ico: '✝',  name: 'Thanksgiving Prayer',        duration: '45 mins',    priceLo: 2000, priceHi: 6000, image: christianSvcImg('thanksgiving-prayer') },
  { ico: '💗', name: 'Healing Prayer / Anointing', duration: '30–45 mins', priceLo: 1500, priceHi: 5000, image: christianSvcImg('healing-prayer-anointing') },
];

const LIFE_EVENTS: SimpleService[] = [
  { ico: '🎂', name: 'Birthday Blessing Prayer', duration: '20–30 mins', priceLo: 1000, priceHi: 3000,  image: christianSvcImg('birthday-blessing-prayer') },
  { ico: '💗', name: 'Anniversary Blessing',     duration: '30 mins',    priceLo: 1500, priceHi: 4000,  image: christianSvcImg('anniversary-blessing') },
  { ico: '👥', name: 'Youth Fellowship Session', duration: '1–2 hrs',    priceLo: 3000, priceHi: 10000, image: christianSvcImg('youth-fellowship-session') },
  { ico: '🎵', name: 'Choir / Worship Booking',  duration: '1–2 hrs',    priceLo: 5000, priceHi: 20000, image: christianSvcImg('choir-worship-booking') },
];

interface CounselingItem {
  ico: string; name: string; duration: string; priceLo: number; priceHi: number;
}
const ONLINE_COUNSELING: CounselingItem[] = [
  { ico: '👥', name: 'Christian Counseling', duration: '30 mins',    priceLo: 500,  priceHi: 1500 },
  { ico: '💑', name: 'Marriage Counseling',  duration: '45 mins',    priceLo: 1000, priceHi: 2500 },
  { ico: '🙏', name: 'Spiritual Guidance',   duration: '30 mins',    priceLo: 500,  priceHi: 1200 },
];

const VIRTUAL_PRAYER: CounselingItem[] = [
  { ico: '🕯', name: 'Live Prayer Session',   duration: '20–30 mins', priceLo: 600, priceHi: 1500 },
  { ico: '🙏', name: 'Healing Prayer Online', duration: '30 mins',    priceLo: 500, priceHi: 1500 },
];

interface PriestProfile {
  name: string; yearsExp: string; rating: number; reviews: number; available: boolean;
}
const TOP_PRIESTS: PriestProfile[] = [
  { name: 'Fr. Thomas Mathew',   yearsExp: '15+ Years Experience', rating: 4.9, reviews: 320, available: true },
  { name: "Fr. Joseph D'Souza",  yearsExp: '12+ Years Experience', rating: 4.8, reviews: 210, available: true },
  { name: 'Pastor John Samuel',  yearsExp: '18+ Years Experience', rating: 4.9, reviews: 450, available: true },
  { name: 'Pastor Grace Roy',    yearsExp: '10+ Years Experience', rating: 4.8, reviews: 185, available: true },
  { name: 'Fr. Alex Varghese',   yearsExp: '14+ Years Experience', rating: 4.9, reviews: 278, available: true },
];

function rupees(n: number): string { return '₹' + n.toLocaleString('en-IN'); }

function ServiceCard({ s }: { s: BookableService }) {
  const router = useRouter();
  const goBook = () =>
    router.push(`/priests/invite?faith=christian&ceremony=${encodeURIComponent(s.name)}`);
  return (
    <div style={{
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      border: '1px solid rgba(200,146,10,0.22)',
      boxShadow: '0 2px 8px rgba(60,30,5,0.06)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* Most Booked badge removed per product decision. */}
      <div style={{
        position: 'relative', height: 100, width: '100%',
        background: 'linear-gradient(160deg,#2A1808 0%,#6B3210 60%,#C8920A 100%)',
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={s.image}
          alt={s.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{s.name}</div>
        <div style={{ fontSize: 10, color: TEXT3, lineHeight: 1.35, minHeight: 26 }}>{s.subtitle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: TEXT3, fontSize: 10, marginTop: 4 }}>
          <span>⏱</span><span>{s.duration}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: PRICE, fontFamily: '"Playfair Display",Georgia,serif' }}>
          {rupees(s.priceLo)} – {rupees(s.priceHi)}
        </div>
        <button
          onClick={goBook}
          style={{ marginTop: 4, width: '100%', background: NAVY_2, color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer' }}
        >
          Book Now
        </button>
      </div>
    </div>
  );
}

function SimpleCard({ s }: { s: SimpleService }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(200,146,10,0.22)', position: 'relative' }}>
      <div style={{
        position: 'relative', height: 80, width: '100%',
        background: 'linear-gradient(160deg,#2A1808 0%,#6B3210 60%,#C8920A 100%)',
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={s.image}
          alt={s.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div style={{ padding: '10px 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginBottom: 4 }}>{s.name}</div>
        <div style={{ fontSize: 9.5, color: TEXT3, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
          <span>⏱</span><span>{s.duration}</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: PRICE }}>
          {rupees(s.priceLo)} – {rupees(s.priceHi)}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, viewAllHref }: { title: string; viewAllHref?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 14px 10px' }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: TEXT, fontFamily: '"Playfair Display",Georgia,serif' }}>{title}</span>
      {viewAllHref && (
        <Link href={viewAllHref} style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: 'none' }}>View All ›</Link>
      )}
    </div>
  );
}

export default function ChristianServicesScreen() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        backgroundImage: `linear-gradient(135deg, rgba(10,22,40,0.78) 0%, rgba(26,36,56,0.55) 40%, rgba(42,24,8,0.30) 100%), url('/christian-services-hero.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: NAVY,
        padding: '14px 16px 18px',
        color: '#fff', overflow: 'hidden',
        minHeight: 260,
      }}>
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

        <h1 style={{
          fontSize: 30, fontWeight: 800, lineHeight: 1.0,
          fontFamily: '"Playfair Display",Georgia,serif', color: '#fff',
          margin: '0 0 2px',
        }}>
          Christian
        </h1>
        <div style={{
          fontSize: 26, fontWeight: 800, lineHeight: 1.1,
          fontFamily: '"Playfair Display",Georgia,serif', color: GOLD_L,
          marginBottom: 10,
        }}>
          Services &amp; Guidance
        </div>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45, margin: '0 0 12px', maxWidth: 320 }}>
          Connect with trusted priests, pastors and faith leaders for sacraments, blessings, counseling and spiritual guidance.
        </p>
      </div>

      {/* ── MOST BOOKED SERVICES ─────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <SectionHeader title="Most Booked Services" viewAllHref="#" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 14px' }}>
          {MOST_BOOKED.map(s => <ServiceCard key={s.name} s={s} />)}
        </div>
      </div>

      {/* ── HOUSE BLESSINGS & SPECIAL PRAYERS ────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader title="House Blessings & Special Prayers" viewAllHref="#" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 14px' }}>
          {HOUSE_BLESSINGS.map(s => <SimpleCard key={s.name} s={s} />)}
        </div>
      </div>

      {/* ── LIFE EVENTS & COMMUNITY SERVICES ─────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader title="Life Events & Community Services" viewAllHref="#" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 14px' }}>
          {LIFE_EVENTS.map(s => <SimpleCard key={s.name} s={s} />)}
        </div>
      </div>

      {/* Online Counseling + Bible & Faith Learning + Virtual Prayer Services blocks removed per product decision. */}

      {/* Personalized Services (High Demand) + Top Priests & Pastors sections removed per product decision. */}

    </div>
  );
}
