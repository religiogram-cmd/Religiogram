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

// ── EXACT data from approved mockup ──────────────────────────────────────
// Never edit without product sign-off — names, durations, price ranges are
// reviewed for legal + pricing accuracy.

interface BookableService {
  badge?: string;
  name: string;
  subtitle: string;
  duration: string;
  priceLo: number;
  priceHi: number;
  /** Drop your real image at /priests/muslim/services/<slug>.jpg. */
  image: string;
}
function muslimSvcImg(slug: string): string {
  return `/priests/muslim/services/${slug}.jpg`;
}
const MOST_BOOKED: BookableService[] = [
  { badge: 'Most Booked', name: 'Nikah Ceremony',   subtitle: 'Marriage solemnization by verified Imam', duration: '45–120 mins', priceLo: 3000, priceHi: 50000, image: muslimSvcImg('nikah-ceremony') },
  {                       name: 'Dua & Blessing',   subtitle: 'Home visits and special prayers',          duration: '30–90 mins',  priceLo: 1000, priceHi: 6000,  image: muslimSvcImg('dua-blessing')   },
  {                       name: 'Aqeeqah Ceremony', subtitle: 'Naming ceremony and religious guidance',   duration: '1–3 hrs',     priceLo: 2000, priceHi: 12000, image: muslimSvcImg('aqeeqah-ceremony')},
  {                       name: 'Janazah Prayer',   subtitle: 'Funeral prayer guidance and support',      duration: '30–90 mins',  priceLo: 1000, priceHi: 7000,  image: muslimSvcImg('janazah-prayer') },
];

interface ImamTier {
  tier: 'New Imam' | 'Verified Imam' | 'Senior Imam';
  rateLo: number;
  rateHi: number;
  icon: string;
}
const CONSULTATION_TIERS: ImamTier[] = [
  { tier: 'New Imam',      rateLo: 5,  rateHi: 12, icon: '👤' },
  { tier: 'Verified Imam', rateLo: 15, rateHi: 30, icon: '✓' },
  { tier: 'Senior Imam',   rateLo: 30, rateHi: 80, icon: '⭐' },
];

interface SpecialEvent {
  name: string; subtitle: string; when: string; priceLo: number; priceHi: number;
  /** Drop your real image at /priests/muslim/services/<slug>.jpg. */
  image: string;
}
const RAMADAN_EVENTS: SpecialEvent[] = [
  { name: 'Taraweeh Imam', subtitle: 'Imam for Taraweeh prayers during Ramadan', when: 'Ramadan Period', priceLo: 5000, priceHi: 25000, image: muslimSvcImg('taraweeh-imam') },
  { name: 'Eid Khutbah',   subtitle: 'Eid sermon delivered by experienced Imam', when: '30–60 mins',      priceLo: 3000, priceHi: 15000, image: muslimSvcImg('eid-khutbah')   },
];

interface AddOn {
  ico: string; name: string; price: string;
}
const ADDONS: AddOn[] = [
  { ico: '🚗', name: 'Travel Fee',                  price: '₹10 – ₹30/km'  },
  { ico: '⚡', name: 'Urgent Booking (<6 hrs)',     price: '+20% – +40%'   },
  { ico: '🕐', name: 'Late Night / Early Morning',  price: '₹500 – ₹2,000' },
  { ico: '🤲', name: 'Extra Dua / Extended Time',   price: '₹500 – ₹2,000' },
  { ico: '👥', name: 'Multi-Family Service',        price: '₹1,000 – ₹5,000' },
];

interface ImamProfile {
  name: string;
  yearsExp: string;
  langs: string;
  rating: number;
  reviews: number;
  online: boolean;
  perMin: number;
}
const TOP_IMAMS: ImamProfile[] = [
  { name: 'Maulana Sajjad Ahmed',  yearsExp: '8+ Years Experience',  langs: 'Urdu, Hindi, English', rating: 4.8, reviews: 236, online: true,  perMin: 18 },
  { name: 'Maulana Farhan Qadri',  yearsExp: '12+ Years Experience', langs: 'Urdu, Hindi, Arabic',  rating: 4.9, reviews: 412, online: true,  perMin: 25 },
  { name: 'Mufti Abdul Rahman',    yearsExp: '15+ Years Experience', langs: 'Urdu, Arabic, English',rating: 4.9, reviews: 589, online: true,  perMin: 40 },
  { name: 'Maulana Khalid Hussain',yearsExp: '20+ Years Experience', langs: 'Urdu, Arabic, English',rating: 5.0, reviews: 764, online: false, perMin: 60 },
];

const CATEGORY_ICONS = [
  { ico: '👤', label: 'Imams /\nScholars'        },
  { ico: '🕌', label: 'Mosques'                  },
  { ico: '📖', label: 'Spiritual\nConsultation'  },
  { ico: '👥', label: 'Community'                },
  { ico: '📅', label: 'Events &\nPrograms'      },
  { ico: '🤲', label: 'Charity /\nZakat'         },
];

function rupees(n: number): string { return '₹' + n.toLocaleString('en-IN'); }

function ServiceCard({ s }: { s: BookableService }) {
  const router = useRouter();
  const goBook = () =>
    router.push(`/priests/invite?faith=muslim&ceremony=${encodeURIComponent(s.name)}`);
  return (
    <div style={{
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      border: '1px solid rgba(200,146,10,0.22)',
      boxShadow: '0 2px 8px rgba(60,30,5,0.06)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {/* Most Booked badge removed per product decision. */}
      {/* Image area — falls back to a warm gradient with mosque glyph if the
          file at s.image doesn't exist yet (e.g. before assets are dropped). */}
      <div style={{
        position: 'relative',
        height: 110, width: '100%',
        background: 'linear-gradient(160deg,#3D1E08 0%,#6B3210 60%,#C8920A 100%)',
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
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
        }}>
          🕌
        </div>
      </div>
      <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.25, textAlign: 'center' }}>{s.name}</div>
        <div style={{ fontSize: 9.5, color: TEXT3, lineHeight: 1.4, textAlign: 'center' }}>{s.subtitle}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: TEXT3, fontSize: 9.5, marginTop: 2 }}>
          <span>⏱</span><span>{s.duration}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#7A1F1F', textAlign: 'center', fontFamily: '"Playfair Display",Georgia,serif' }}>
          {rupees(s.priceLo)} – {rupees(s.priceHi)}
        </div>
        <button
          onClick={goBook}
          style={{
            marginTop: 4, width: '100%',
            background: NAVY_2, color: '#fff',
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

function SectionHeader({ title, viewAllHref }: { title: string; viewAllHref?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 14px 10px' }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: TEXT, fontFamily: '"Playfair Display",Georgia,serif' }}>{title}</span>
      {viewAllHref && (
        <Link href={viewAllHref} style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          View All ›
        </Link>
      )}
    </div>
  );
}

export default function MuslimServicesScreen() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        backgroundImage: `linear-gradient(135deg, rgba(10,22,40,0.78) 0%, rgba(26,36,56,0.55) 40%, rgba(42,24,8,0.30) 100%), url('/muslim-services-hero.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: NAVY,
        padding: '14px 16px 22px',
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
          fontSize: 30, fontWeight: 800, lineHeight: 1.05,
          fontFamily: '"Playfair Display",Georgia,serif', color: '#fff',
          margin: '0 0 6px',
        }}>
          Muslim Services<br/>&amp; Guidance
        </h1>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45, margin: '0 0 14px', maxWidth: 320 }}>
          Connect with trusted Imams and Maulvis for Nikah, Janazah, Aqeeqah, Dua, Quran guidance and spiritual consultations.
        </p>
        {/* Header CTAs (Book a Maulvi / Talk to an Imam) removed per product decision. */}
      </div>

      {/* 6 round category icons (Imams/Mosques/Consultation/Community/Events/Charity) removed per product decision. */}

      {/* ── MOST BOOKED SERVICES ─────────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader title="Most Booked Services" viewAllHref="#" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 14px' }}>
          {MOST_BOOKED.map(s => <ServiceCard key={s.name} s={s} />)}
        </div>
      </div>

      {/* Talk to an Imam (Online Consultation) block removed per product decision. */}

      {/* ── RAMADAN & SPECIAL EVENTS ─────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader title="Ramadan & Special Events" viewAllHref="#" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 14px' }}>
          {RAMADAN_EVENTS.map(e => (
            <div key={e.name} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: '1px solid rgba(200,146,10,0.22)',
              boxShadow: '0 2px 8px rgba(60,30,5,0.06)',
            }}>
              {/* Image with gradient + crescent-moon fallback */}
              <div style={{
                position: 'relative',
                height: 88, width: '100%',
                background: 'linear-gradient(160deg,#2A1808 0%,#6B3210 60%,#C8920A 100%)',
                overflow: 'hidden',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.image}
                  alt={e.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                  onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
                }}>
                  🌙
                </div>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 3 }}>{e.name}</div>
                <div style={{ fontSize: 9.5, color: TEXT3, lineHeight: 1.4, marginBottom: 6 }}>{e.subtitle}</div>
                <div style={{ fontSize: 9, color: TEXT3, marginBottom: 4 }}>📅 {e.when}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#7A1F1F' }}>{rupees(e.priceLo)} – {rupees(e.priceHi)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add-on Services block removed per product decision. */}

      {/* Top Rated Imams + bottom trust bar removed per product decision. */}
    </div>
  );
}
