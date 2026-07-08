'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
// No API imports needed for this screen

const GOLD   = '#C8920A';
const GOLD_L = '#E8A800';
const NAVY   = '#0F2452';
const BG     = '#FDF6E3';
const TEXT   = '#1A0800';
const TEXT2  = '#4A3010';
const TEXT3  = '#8B6B35';

/* Faith cards mirrored on Home (same design language as the old
 * /priests landing) — one full-width card per row, tapping deep-links
 * to /priests?faith=<key> so the Priests screen skips its own landing.
 * See PriestsScreen.tsx for the source of these strings.               */
const FAITH_CARDS = [
  { key: 'hindu',     label: 'Hindu',     image: '/priests/hindu-hero.jpg',     desc: 'Pujas, rituals, havans & ceremonies',        verified: 'Verified & Experienced Pandits' },
  { key: 'muslim',    label: 'Muslim',    image: '/priests/muslim-hero.jpg',    desc: 'Namaz services, dua, Nikah & other rituals', verified: 'Verified & Experienced Imams' },
  { key: 'sikh',      label: 'Sikh',      image: '/priests/sikh-hero.jpg',      desc: 'Gurbani, path, kirtan & Sikh ceremonies',    verified: 'Verified & Experienced Granthis' },
  { key: 'christian', label: 'Christian', image: '/priests/christian-hero.jpg', desc: 'Mass, prayers, sacraments & life events',     verified: 'Verified & Experienced Priests' },
];

const FAQS = [
  { q: 'What is ReligioGram?', a: 'ReligioGram is a community platform connecting devotees with verified places of worship, spiritual guides, and religious services for all faiths across India.' },
  { q: 'How do I find places of worship near me?', a: 'Tap Holy Places in the bottom nav, choose your faith, and the app will show temples, mosques, churches, gurudwaras and more near your location.' },
  { q: 'Can I book a pandit or priest?', a: 'Yes! Open Priests, choose your faith, pick a ritual or ceremony, and book a verified guide in just a few taps.' },
  { q: 'Is ReligioGram free to use?', a: 'Yes, browsing and discovery are completely free. Service bookings and donations go directly to the guides and places of worship you choose.' },
  { q: 'How are places verified?', a: 'Our team manually verifies each listing by contacting the place of worship directly and cross-checking with official records before awarding the Verified badge.' },
  { q: 'Which religions are supported?', a: 'We support Hindu, Muslim, Christian, Sikh, Buddhist, Jain, Zoroastrian and other traditions. More faiths are added regularly based on community demand.' },
];

const INSPIRATIONS = [
  { quote: 'The mind finds peace when the heart connects with the divine.', source: 'Bhagavad Gita' },
  { quote: 'Prayer is not asking. It is a longing of the soul.', source: 'Mahatma Gandhi' },
  { quote: 'In the silence of the heart, God speaks.', source: 'Mother Teresa' },
];

const PLACES = [
  { name: 'Golden Temple', city: 'Amritsar, Punjab', rating: 4.8, img: 'https://images.unsplash.com/photo-1558431382-27e303142255?w=400&q=80' },
  { name: 'Kashi Vishwanath Temple', city: 'Varanasi, UP', rating: 4.7, img: 'https://images.unsplash.com/photo-1561361058-c24e2b4bec10?w=400&q=80' },
  { name: 'Jama Masjid', city: 'Delhi', rating: 4.6, img: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400&q=80' },
  { name: 'Sacred Heart Cathedral', city: 'New Delhi', rating: 4.6, img: 'https://images.unsplash.com/photo-1548625149-720d7fca6e4b?w=400&q=80' },
];

const SERVICES = [
  { title: 'Book Priest / Rituals', sub: 'Puja, Havan, Path & more', img: 'https://images.unsplash.com/photo-1604881991720-f91add269bed?w=300&q=80', href: '/rituals' },
  { title: 'Talk to Spiritual Guide', sub: 'Get guidance & clarity', img: 'https://images.unsplash.com/photo-1607962837359-5e7e89f86776?w=300&q=80', href: '/guides' },
  { title: 'Request Ceremony', sub: 'Weddings, Mundan, Grih Pravesh & more', img: 'https://images.unsplash.com/photo-1620483468040-c06fb83bb0c8?w=300&q=80', href: '/rituals?tab=ceremony' },
  { title: 'Online Consultation', sub: 'One-on-one video call', img: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=300&q=80', href: '/guides?tab=online' },
];

const FESTIVALS = [
  { name: 'Janmashtami', date: '26 Aug 2024', img: 'https://images.unsplash.com/photo-1567591370641-15f3b4e08df1?w=200&q=80' },
  { name: 'Eid-ul-Adha', date: '16 Jun 2024', img: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=200&q=80' },
  { name: 'Christmas', date: '25 Dec 2024', img: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=200&q=80' },
  { name: 'Guru Purab', date: '15 Nov 2024', img: 'https://images.unsplash.com/photo-1558431382-27e303142255?w=200&q=80' },
];

const QUICK_ACTIONS = [
  { icon: '🙏', label: 'Priests /\nGuides',       href: '/guides'                 },
  { icon: '🕌', label: 'Holy\nPlaces',             href: '/places'                 },
  { icon: '✨', label: 'Spiritual\nConsultancy',    href: '/guides?tab=astrology'   },
  { icon: '👥', label: 'Community',               href: '/social'                 },
  { icon: '📅', label: 'Events /\nFestivals',      href: '/places?tab=events'      },
  { icon: '🤲', label: 'Donations /\nCharity',     href: '/places?tab=donate'      },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#F59E0B', fontSize: 11 }}>★</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{rating}</span>
    </div>
  );
}

export default function HomeScreen() {
  const [openFaq, setOpenFaq]   = useState<number | null>(null);
  const [inspIdx, setInspIdx]   = useState(0);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX 5: First-time welcome banner (dismissed via sessionStorage)
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('welcome_seen');
  });

  const dismissWelcome = () => {
    sessionStorage.setItem('welcome_seen', '1');
    setShowWelcome(false);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => setInspIdx(i => (i + 1) % INSPIRATIONS.length), 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div style={{ minHeight: '100svh', background: BG, fontFamily: '"Plus Jakarta Sans", sans-serif', paddingBottom: 30 }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: BG, padding: '14px 16px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(200,146,10,0.18)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', lineHeight: 1.1 }}>
            Religiogram
          </div>
        </div>
        {/* Header right-side actions removed per product decision —
            notifications/chat/create are reachable from other routes. */}
      </div>

      {/* ── WELCOME BANNER (first-time users) ─────────────────────────────── */}
      {showWelcome && (
        <div style={{
          margin: '12px 16px 0',
          padding: '14px 16px',
          background: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
          borderRadius: 16,
          color: '#fff',
          position: 'relative',
        }}>
          <button
            onClick={dismissWelcome}
            style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
          <h3 style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>🙏 Welcome to Religiogram</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.5 }}>
            Find priests, book ceremonies, connect with holy places and your spiritual community.
          </p>
        </div>
      )}

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <div style={{ background: '#F5E8C4', position: 'relative', overflow: 'hidden' }}>
        {/* Hero artwork — ornate arch + peacocks + lanterns + multi-faith skyline.
            Tall aspect ratio mirrors the mockup; image fills the frame via
            objectFit cover so portrait phones don't crop the peacocks out. */}
        <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
          {/* LCP image: priority + fetchPriority hint the browser to start
              decoding immediately. width/height drive the intrinsic ratio so
              the layout doesn't shift when the image lands. AVIF/WebP variants
              are generated by Next from the source JPG. */}
          <Image
            src="/home-hero.jpg"
            alt="Multi-faith spiritual journey"
            width={1200}
            height={900}
            priority
            fetchPriority="high"
            sizes="(max-width: 640px) 100vw, 640px"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {/* Title overlay — sits in the empty arched centre of the artwork */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '15%',
            textAlign: 'center', padding: '0 28px', zIndex: 4, pointerEvents: 'none',
          }}>
            <h1 style={{
              fontSize: 36, fontWeight: 900,
              fontFamily: '"Playfair Display",Georgia,"Times New Roman",serif',
              color: '#1A2A4A', lineHeight: 1.05, margin: '0 0 12px',
              letterSpacing: '-0.005em',
              textShadow: '0 1px 6px rgba(255,250,235,0.7)',
            }}>
              Your Spiritual<br/>Journey Starts Here
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '10px 0 12px' }}>
              <div style={{ height: 1, width: 42, background: '#A78240' }} />
              <span style={{ color: '#A78240', fontSize: 14 }}>❖</span>
              <div style={{ height: 1, width: 42, background: '#A78240' }} />
            </div>
            <p style={{
              fontSize: 14, color: '#2D2010', lineHeight: 1.55, fontWeight: 400,
              margin: '0 auto', maxWidth: 300,
              fontFamily: '"Plus Jakarta Sans","Inter",system-ui,sans-serif',
            }}>
              Discover holy places, book spiritual guides, seek wisdom, and connect with your faith community.
            </p>
          </div>
          {/* CTAs sit over the temple-silhouette band at the bottom of the
              image. Two equal-width pills in a grid; no icons so the full
              label fits at a comfortable size on any phone width. */}
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: '5%',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            zIndex: 5,
          }}>
            <Link href="/places" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
              background: NAVY, color: '#fff',
              padding: '11px 8px', borderRadius: 28,
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(15,36,82,0.45)',
              minWidth: 0,
            }}>
              Explore Holy Places
            </Link>
            <Link href="/priests" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
              background: GOLD_L, color: NAVY,
              padding: '11px 8px', borderRadius: 28,
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(200,146,10,0.5)',
              minWidth: 0,
            }}>
              Book Spiritual Services
            </Link>
          </div>
        </div>
      </div>

      {/* ── LEGACY INLINE-SVG HERO (kept hidden as a fallback reference) ──── */}
      <div style={{ display: 'none' }}>
        {/* Arch SVG */}
        <svg viewBox="0 0 375 400" style={{ width: '100%', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="archStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8B6010"/>
              <stop offset="50%" stopColor="#D4A020"/>
              <stop offset="100%" stopColor="#8B6010"/>
            </linearGradient>
          </defs>

          {/* Sky fill */}
          <rect width="375" height="400" fill="rgba(255,248,200,0.15)"/>

          {/* Outer arch */}
          <path d="M32,400 L32,195 Q32,52 187.5,42 Q343,52 343,195 L343,400"
            fill="none" stroke="#8B6010" strokeWidth="3.5" opacity="0.75"/>
          {/* Inner arch */}
          <path d="M56,400 L56,208 Q56,86 187.5,76 Q319,86 319,208 L319,400"
            fill="rgba(255,248,200,0.12)" stroke="#B8860B" strokeWidth="2" opacity="0.65"/>
          {/* Second inner */}
          <path d="M72,400 L72,218 Q72,108 187.5,98 Q303,108 303,218 L303,400"
            fill="none" stroke="#D4A020" strokeWidth="1.2" opacity="0.5" strokeDasharray="6 4"/>

          {/* Keystone at top */}
          <ellipse cx="187.5" cy="48" rx="20" ry="13" fill="#C8920A" opacity="0.85"/>
          <ellipse cx="187.5" cy="48" rx="12" ry="7" fill="#F0C840" opacity="0.9"/>
          <ellipse cx="187.5" cy="48" rx="5" ry="3" fill="#fff" opacity="0.6"/>

          {/* Arch pillars */}
          <rect x="28" y="195" width="8" height="205" fill="#8B6010" opacity="0.6"/>
          <rect x="339" y="195" width="8" height="205" fill="#8B6010" opacity="0.6"/>
          <rect x="52" y="208" width="6" height="192" fill="#B8860B" opacity="0.45"/>
          <rect x="317" y="208" width="6" height="192" fill="#B8860B" opacity="0.45"/>

          {/* Hanging lanterns LEFT */}
          <g transform="translate(94, 115)">
            <line x1="0" y1="-28" x2="0" y2="0" stroke="#8B6010" strokeWidth="1.5"/>
            <ellipse cx="0" cy="9" rx="9" ry="13" fill="#C8820A" opacity="0.88"/>
            <ellipse cx="0" cy="5" rx="7" ry="4.5" fill="#F0C030" opacity="0.75"/>
            <ellipse cx="0" cy="20" rx="5.5" ry="3.5" fill="#8B6010" opacity="0.8"/>
            <line x1="0" y1="22" x2="0" y2="29" stroke="#8B6010" strokeWidth="1.5"/>
            <ellipse cx="0" cy="31" rx="3.5" ry="2.5" fill="#F0C030" opacity="0.7"/>
          </g>
          {/* Hanging lanterns RIGHT */}
          <g transform="translate(281, 115)">
            <line x1="0" y1="-28" x2="0" y2="0" stroke="#8B6010" strokeWidth="1.5"/>
            <ellipse cx="0" cy="9" rx="9" ry="13" fill="#C8820A" opacity="0.88"/>
            <ellipse cx="0" cy="5" rx="7" ry="4.5" fill="#F0C030" opacity="0.75"/>
            <ellipse cx="0" cy="20" rx="5.5" ry="3.5" fill="#8B6010" opacity="0.8"/>
            <line x1="0" y1="22" x2="0" y2="29" stroke="#8B6010" strokeWidth="1.5"/>
            <ellipse cx="0" cy="31" rx="3.5" ry="2.5" fill="#F0C030" opacity="0.7"/>
          </g>

          {/* LEFT PEACOCK */}
          <g transform="translate(0, 65)">
            {[-45,-28,-12,4,20,36].map((angle, i) => (
              <g key={i} transform={`rotate(${angle}, 34, 88)`}>
                <line x1="34" y1="88" x2="34" y2="30" stroke="#2E7D32" strokeWidth="3" opacity="0.78"/>
                <ellipse cx="34" cy="24" rx="6" ry="8" fill="#43A047" opacity="0.72"/>
                <ellipse cx="34" cy="21" rx="3.5" ry="4.5" fill="#1565C0" opacity="0.7"/>
                <ellipse cx="34" cy="19.5" rx="1.8" ry="2.2" fill="#F0C030" opacity="0.88"/>
              </g>
            ))}
            <ellipse cx="34" cy="96" rx="14" ry="10" fill="#1B5E20" opacity="0.82"/>
            <path d="M34,87 Q28,74 30,64 Q32,55 34,62 Q36,70 35,80 Z" fill="#1565C0" opacity="0.78"/>
            <circle cx="32" cy="61" r="7" fill="#0D47A1" opacity="0.85"/>
            {[-2,0,2].map((x,i) => (
              <g key={i}>
                <line x1={32+x} y1="54" x2={32+x} y2="46" stroke="#43A047" strokeWidth="1.5"/>
                <circle cx={32+x} cy="44.5" r="2.2" fill="#F0C030" opacity="0.88"/>
              </g>
            ))}
            <path d="M25,61 L20,63 L25,64.5 Z" fill="#F0C030"/>
            <circle cx="28.5" cy="60" r="1.8" fill="#fff"/>
            <circle cx="28.5" cy="60" r="0.9" fill="#111"/>
          </g>

          {/* RIGHT PEACOCK (mirror) */}
          <g transform="translate(375, 65) scale(-1,1)">
            {[-45,-28,-12,4,20,36].map((angle, i) => (
              <g key={i} transform={`rotate(${angle}, 34, 88)`}>
                <line x1="34" y1="88" x2="34" y2="30" stroke="#2E7D32" strokeWidth="3" opacity="0.78"/>
                <ellipse cx="34" cy="24" rx="6" ry="8" fill="#43A047" opacity="0.72"/>
                <ellipse cx="34" cy="21" rx="3.5" ry="4.5" fill="#1565C0" opacity="0.7"/>
                <ellipse cx="34" cy="19.5" rx="1.8" ry="2.2" fill="#F0C030" opacity="0.88"/>
              </g>
            ))}
            <ellipse cx="34" cy="96" rx="14" ry="10" fill="#1B5E20" opacity="0.82"/>
            <path d="M34,87 Q28,74 30,64 Q32,55 34,62 Q36,70 35,80 Z" fill="#1565C0" opacity="0.78"/>
            <circle cx="32" cy="61" r="7" fill="#0D47A1" opacity="0.85"/>
            {[-2,0,2].map((x,i) => (
              <g key={i}>
                <line x1={32+x} y1="54" x2={32+x} y2="46" stroke="#43A047" strokeWidth="1.5"/>
                <circle cx={32+x} cy="44.5" r="2.2" fill="#F0C030" opacity="0.88"/>
              </g>
            ))}
            <path d="M25,61 L20,63 L25,64.5 Z" fill="#F0C030"/>
            <circle cx="28.5" cy="60" r="1.8" fill="#fff"/>
            <circle cx="28.5" cy="60" r="0.9" fill="#111"/>
          </g>

          {/* MULTI-FAITH SKYLINE silhouettes */}
          <g opacity="0.40" fill="#5D3A1A">
            {/* Central large Hindu temple */}
            <rect x="148" y="295" width="79" height="105"/>
            <polygon points="148,295 187.5,248 227,295"/>
            <rect x="160" y="250" width="55" height="11"/>
            <polygon points="160,250 187.5,228 215,250"/>
            <rect x="172" y="230" width="31" height="8"/>
            <polygon points="172,230 187.5,212 203,230"/>
            <rect x="180" y="214" width="15" height="6"/>
            {/* Temple side spires */}
            <rect x="140" y="316" width="12" height="84"/>
            <polygon points="140,316 146,299 152,316"/>
            <rect x="223" y="316" width="12" height="84"/>
            <polygon points="223,316 229,299 235,316"/>

            {/* Left mosque */}
            <rect x="62" y="328" width="58" height="72"/>
            <path d="M62,328 Q91,296 120,328 Z"/>
            <rect x="82" y="308" width="18" height="20"/>
            <rect x="57" y="305" width="11" height="95"/>
            <ellipse cx="62.5" cy="302" rx="7" ry="9"/>
            <rect x="117" y="305" width="11" height="95"/>
            <ellipse cx="122.5" cy="302" rx="7" ry="9"/>

            {/* Right church */}
            <rect x="245" y="328" width="58" height="72"/>
            <polygon points="245,328 274,296 303,328"/>
            <rect x="264" y="280" width="20" height="28"/>
            <rect x="272" y="274" width="4" height="32"/>
            <rect x="265" y="284" width="18" height="4"/>

            {/* Far left gurdwara */}
            <rect x="8" y="348" width="44" height="52"/>
            <path d="M8,348 Q30,316 52,348 Z"/>
            <ellipse cx="30" cy="313" rx="14" ry="17"/>
            <rect x="26" y="298" width="8" height="17"/>

            {/* Far right smaller temple */}
            <rect x="323" y="345" width="44" height="55"/>
            <polygon points="323,345 345,316 367,345"/>
            <polygon points="330,316 345,300 360,316"/>
            <polygon points="337,300 345,290 353,300"/>
          </g>

          {/* Ground */}
          <rect x="0" y="397" width="375" height="3" fill="rgba(93,58,26,0.28)"/>

          {/* Floral top-left corner vine */}
          <g opacity="0.55">
            <path d="M0,0 Q12,20 8,45 Q4,68 18,85" fill="none" stroke="#8B6010" strokeWidth="2"/>
            <circle cx="8" cy="22" r="5" fill="#C8920A"/>
            <circle cx="6" cy="42" r="4" fill="#D4A020"/>
            <circle cx="16" cy="60" r="3.5" fill="#C8920A"/>
            <path d="M0,0 Q25,8 32,18" fill="none" stroke="#8B6010" strokeWidth="1.8"/>
            <circle cx="22" cy="10" r="4" fill="#D4A020"/>
            <circle cx="32" cy="18" r="3" fill="#C8920A"/>
          </g>
          {/* Floral top-right corner */}
          <g opacity="0.55" transform="translate(375,0) scale(-1,1)">
            <path d="M0,0 Q12,20 8,45 Q4,68 18,85" fill="none" stroke="#8B6010" strokeWidth="2"/>
            <circle cx="8" cy="22" r="5" fill="#C8920A"/>
            <circle cx="6" cy="42" r="4" fill="#D4A020"/>
            <circle cx="16" cy="60" r="3.5" fill="#C8920A"/>
            <path d="M0,0 Q25,8 32,18" fill="none" stroke="#8B6010" strokeWidth="1.8"/>
            <circle cx="22" cy="10" r="4" fill="#D4A020"/>
            <circle cx="32" cy="18" r="3" fill="#C8920A"/>
          </g>

          {/* Arch dot decorations */}
          {[0.1,0.22,0.35,0.5,0.65,0.78,0.9].map((t, i) => {
            const a = Math.PI + t * Math.PI;
            const cx2 = 187.5 + 155 * Math.cos(a);
            const cy2 = 200 + 158 * Math.sin(a);
            return <circle key={i} cx={cx2} cy={cy2} r={i % 2 === 0 ? 3.5 : 2.5} fill="#C8920A" opacity="0.65"/>;
          })}
        </svg>

        {/* Hero text area */}
        <div style={{ padding: '0 24px 28px', marginTop: -110, position: 'relative', zIndex: 5, textAlign: 'center' }}>
          <h1 style={{
            fontSize: 28, fontWeight: 800,
            fontFamily: '"Playfair Display",Georgia,serif',
            color: NAVY, lineHeight: 1.22, margin: '0 0 10px',
            textShadow: '0 1px 4px rgba(255,255,255,0.7)',
          }}>
            Your Spiritual<br/>Journey Starts Here
          </h1>
          <p style={{ fontSize: 13.5, color: TEXT2, lineHeight: 1.65, margin: '0 auto 22px', maxWidth: 290 }}>
            Discover holy places, book spiritual guides, seek wisdom, and connect with your faith community.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/places" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
              background: NAVY, color: '#fff',
              padding: '13px 20px', borderRadius: 30,
              fontSize: 13.5, fontWeight: 700,
              boxShadow: '0 4px 16px rgba(15,36,82,0.4)',
            }}>
              📍 Explore Holy Places
            </Link>
            <Link href="/guides" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
              background: GOLD_L, color: NAVY,
              padding: '13px 20px', borderRadius: 30,
              fontSize: 13.5, fontWeight: 700,
              boxShadow: '0 4px 16px rgba(200,146,10,0.45)',
            }}>
              🪷 Book Spiritual Services
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions (6 round category icons) removed per product decision. */}

      {/* Featured Holy Places section removed per product decision. */}

      {/* Spiritual Services section removed per product decision. */}

      {/* Daily Inspiration + Upcoming Festivals section removed per product decision. */}

      {/* ── VERIFIED PRIESTS BANNER ─────────────────────────────────────────── */}
      <div style={{
        margin: '20px 16px 0',
        background: NAVY,
        borderRadius: 16,
        padding: '14px 14px 14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Shield icon */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(200,146,10,0.18)',
          border: '1.5px solid rgba(200,146,10,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD_L} strokeWidth="2" strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 12 11 14 15 10"/>
          </svg>
        </div>

        {/* Title + subtitle — flex column, min-width 0 so it can shrink instead of forcing 1-word-per-line wrap */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 700, color: '#fff',
            fontFamily: '"Playfair Display",Georgia,serif',
            lineHeight: 1.18, marginBottom: 4,
          }}>
            Verified Priests &amp; Trusted Services
          </div>
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.62)',
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            Authentic • Verified • Reliable
          </div>
        </div>

        {/* CTA — compact pill so the title gets the lion's share of width */}
        <Link href="/guides" style={{
          flexShrink: 0,
          background: GOLD_L, color: NAVY,
          fontSize: 12, fontWeight: 800,
          padding: '8px 12px', borderRadius: 20,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Explore Now
        </Link>
      </div>

      {/* ── RITUALS & SERVICES (faith cards, one per row) ─────────────────
       * Moved here from /priests landing. Deep-links to /priests?faith=<key>
       * so the Priests screen renders that faith's detail page directly.
       * Full-width vertical stack matches the "line by line" spec.       */}
      <div style={{ margin: '22px 16px 0' }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: TEXT, fontFamily: '"Playfair Display",Georgia,serif', display: 'block', marginBottom: 12 }}>
          Rituals &amp; Services
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAITH_CARDS.map(fc => (
            <Link
              key={fc.key}
              href={`/priests?faith=${fc.key}`}
              style={{
                position: 'relative', overflow: 'hidden', borderRadius: 18,
                display: 'block', minHeight: 190, background: '#0A0A0A',
                boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
                textDecoration: 'none',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${fc.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.60) 62%, rgba(0,0,0,0.92) 100%)' }} />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 190, padding: '14px 16px' }}>
                <p style={{ color: GOLD_L, fontSize: 22, fontWeight: 900, margin: '0 0 4px', fontFamily: '"Playfair Display",Georgia,serif', textShadow: '0 2px 6px rgba(0,0,0,0.9)', letterSpacing: '-0.01em' }}>
                  {fc.label}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.90)', fontSize: 12, margin: '0 0 4px', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.4 }}>
                  {fc.desc}
                </p>
                <p style={{ color: GOLD_L, fontSize: 11, fontWeight: 600, margin: '0 0 10px', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                  &#x2713; {fc.verified}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <span style={{
                    background: GOLD_L, borderRadius: 100, padding: '8px 22px',
                    display: 'inline-block', boxShadow: '0 2px 8px rgba(232,168,0,0.35)',
                    minHeight: 32,
                  }}>
                    <span style={{ color: NAVY, fontSize: 12, fontWeight: 800, fontFamily: '"Plus Jakarta Sans",sans-serif', letterSpacing: '0.02em' }}>
                      Explore &#x2192;
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <div style={{ margin: '20px 16px 0' }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: TEXT, fontFamily: '"Playfair Display",Georgia,serif', display: 'block', marginBottom: 12 }}>
          Frequently Asked Questions
        </span>
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1.5px solid rgba(200,146,10,0.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid rgba(200,146,10,0.12)' : 'none' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, color: GOLD_L, fontWeight: 800, lineHeight: 1 }}>{openFaq === i ? '−' : '+'}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>{faq.q}</span>
              </button>
              {openFaq === i && (
                <div style={{ padding: '0 16px 14px 52px', fontSize: 12.5, color: TEXT2, lineHeight: 1.65, borderTop: '1px solid rgba(200,146,10,0.1)' }}>
                  {faq.a}
                        </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* v10 (P0-B recovery): close the outer wrapper opened at the top-level return( */}
    </div>
  );
}
