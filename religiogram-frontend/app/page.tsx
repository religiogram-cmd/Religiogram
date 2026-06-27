'use client';

/**
 * Public landing page at /.
 *
 * 4-section narrative built around the videos in /public/landing/:
 *   1. Hero            — section1-hero.mp4   (desktop 16:9, ~7.5 MB)
 *   2. Verified priests — section2.mp4       (mobile demo)
 *   3. RG AI            — section3.mp4       (mobile demo)
 *   4. Call-to-action   — section4.mp4       (desktop 16:9)
 *
 * Auth lives at /auth. Logged-in users still see the landing — the nav
 * shows "Open app" instead of "Sign in" if a token is present.
 *
 * Responsive: mobile-first single column; ≥768px shifts to side-by-side
 * with video on one side and copy on the other.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { tokenStore } from '@/lib/api';

const NAVY    = '#0A1628';
const NAVY_2  = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFFAEC';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';

export default function LandingPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!tokenStore.access || !!(typeof window !== 'undefined' && localStorage.getItem('rg_access')));
  }, []);

  return (
    <main
      style={{
        background: CREAM,
        color: TEXT,
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        overflowX: 'hidden',
      }}
    >
      <NavBar authed={authed} />

      <Hero authed={authed} />

      <FullBgSection
        videoSrc="/landing/section2.mp4"
        eyebrow="VERIFIED PRIESTS"
        title="Every priest, identity-checked."
        body="Every priest on ReligioGram completes our 9-step KYC — PAN, selfie verification, video introduction, payout setup. You see real people, real qualifications, real reviews from real devotees."
        bullets={[
          'PAN + selfie verified',
          '30-second video introduction',
          'Background-checked across India',
          'Ratings from real bookings',
        ]}
      />

      <FullBgSection
        videoSrc="/landing/section3.mp4"
        eyebrow="RG AI"
        title="Your personal spiritual guide, free."
        body="Ask anything — your kundli, today's panchang, rashifal, scripture meanings, life decisions. RG AI answers in seconds, in your language, with voice and image support. No appointment, no fee."
        bullets={[
          'Kundli, panchang, rashifal — instant',
          'Voice + image input',
          'Multi-language: Hindi, English, regional',
          'Free for everyone — 20 messages a day',
        ]}
      />

      <ClosingCTA />

      <Footer />
    </main>
  );
}

/* ─────────────────────────  NAV BAR  ───────────────────────── */

function NavBar({ authed }: { authed: boolean }) {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,250,236,0.92)',
        backdropFilter: 'saturate(180%) blur(10px)',
        borderBottom: '1px solid rgba(200,146,10,0.18)',
      }}
    >
      <div
        style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundImage: `url('/logo-icon-512.png')`,
              backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
              backgroundColor: NAVY,
            }}
          />
          <span
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 22, fontWeight: 800, color: NAVY,
              letterSpacing: '-0.01em',
            }}
          >
            ReligioGram
          </span>
        </Link>

        <Link
          href={authed ? '/home' : '/auth'}
          style={{
            padding: '10px 20px',
            background: `linear-gradient(135deg,${NAVY_2},${NAVY})`,
            color: CREAM,
            textDecoration: 'none',
            borderRadius: 12,
            fontWeight: 700, fontSize: 14,
            border: `1px solid ${GOLD}30`,
            boxShadow: '0 2px 10px rgba(15,36,82,0.18)',
          }}
        >
          {authed ? 'Open App' : 'Sign In'}
        </Link>
      </div>
    </header>
  );
}

/* ─────────────────────────  HERO  ───────────────────────── */

function Hero({ authed }: { authed: boolean }) {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '88svh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        background: NAVY,
      }}
    >
      <BackgroundVideo src="/landing/section1-hero.mp4" opacity={1} overlayStrength={0.35} />

      <div
        style={{
          position: 'relative', zIndex: 2,
          maxWidth: 980, padding: '120px 24px 100px',
          textAlign: 'center', color: CREAM,
        }}
      >
        <div
          style={{
            display: 'flex', gap: 14,
            justifyContent: 'center', flexWrap: 'wrap',
          }}
        >
          <Link
            href={authed ? '/home' : '/auth'}
            style={{
              padding: '16px 36px',
              background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
              color: NAVY,
              borderRadius: 14, textDecoration: 'none',
              fontWeight: 800, fontSize: 16,
              boxShadow: '0 8px 28px rgba(200,146,10,0.45)',
            }}
          >
            {authed ? 'Open App →' : 'Get Started — Free'}
          </Link>
          <a
            href="#features"
            style={{
              padding: '16px 30px',
              background: 'rgba(255,250,236,0.10)',
              color: CREAM,
              borderRadius: 14, textDecoration: 'none',
              fontWeight: 700, fontSize: 16,
              border: '1px solid rgba(255,250,236,0.25)',
            }}
          >
            Watch demo
          </a>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────  SECTION  ───────────────────────── */

function Section({
  eyebrow,
  title,
  body,
  bullets,
  videoSrc,
  videoOrientation,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  videoSrc: string;
  videoOrientation: 'portrait' | 'landscape';
  reverse: boolean;
}) {
  return (
    <section
      id="features"
      style={{
        padding: '80px 24px',
        background: reverse ? '#FFF6E0' : CREAM,
      }}
    >
      <div
        style={{
          maxWidth: 1180, margin: '0 auto',
          display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row',
          gap: 56, alignItems: 'center', flexWrap: 'wrap',
        }}
        className="rg-section-grid"
      >
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <p
            style={{
              fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: GOLD, fontWeight: 800, marginBottom: 14,
            }}
          >
            {eyebrow}
          </p>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(28px,4vw,46px)', fontWeight: 800,
              color: NAVY, lineHeight: 1.1, margin: '0 0 18px',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          <p style={{ fontSize: 16.5, lineHeight: 1.65, color: TEXT2, margin: 0 }}>
            {body}
          </p>
          <ul
            style={{
              marginTop: 22, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            {bullets.map((b) => (
              <li
                key={b}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 14.5, color: TEXT,
                }}
              >
                <span
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', justifyContent: 'center' }}>
          <InlineVideo src={videoSrc} orientation={videoOrientation} />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  FULL-BG SECTION  ───────────────────────── */

/** Hero-style section where the video fills the entire background and the
 *  copy is centred on top. Use for the marquee feature that deserves the
 *  most visual real-estate (RG AI). */
function FullBgSection({
  videoSrc,
  eyebrow,
  title,
  body,
  bullets,
}: {
  videoSrc: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '78svh',
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
        background: NAVY,
      }}
    >
      <BackgroundVideo src={videoSrc} opacity={1} overlayStrength={0.55} />

      <div
        style={{
          position: 'relative', zIndex: 2,
          maxWidth: 1180, margin: '0 auto',
          padding: '90px 24px',
          color: CREAM, width: '100%',
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <p
            style={{
              fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: GOLD_L, fontWeight: 800, marginBottom: 14,
            }}
          >
            {eyebrow}
          </p>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(30px,4.8vw,52px)',
              fontWeight: 800, lineHeight: 1.08, margin: '0 0 20px',
              letterSpacing: '-0.02em',
              textShadow: '0 4px 24px rgba(0,0,0,0.45)',
            }}
          >
            {title}
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(255,250,236,0.92)', margin: 0 }}>
            {body}
          </p>
          <ul
            style={{
              marginTop: 26, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {bullets.map((b) => (
              <li
                key={b}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  fontSize: 15.5, color: CREAM,
                }}
              >
                <span
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  CLOSING CTA  ───────────────────────── */

function ClosingCTA() {
  return (
    <section
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        background: NAVY,
      }}
    >
      {/* Video stage — sized at native 16:9 so the entire frame shows without
          cropping. Navy fills any letterbox space on tall containers. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          maxHeight: '70svh',
          overflow: 'hidden',
          background: NAVY,
        }}
      >
        <BackgroundVideo
          src="/landing/section4.mp4"
          opacity={1}
          overlayStrength={0.25}
          fit="contain"
        />
      </div>

      {/* CTA copy sits BELOW the video so nothing overlaps the footage. */}
      <div
        style={{
          maxWidth: 820, padding: '64px 24px 90px',
          textAlign: 'center', color: CREAM,
          marginLeft: 'auto', marginRight: 'auto',
        }}
      >
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(30px,5vw,54px)',
            fontWeight: 800, lineHeight: 1.1, margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Begin your devotion journey<br/>
          <span style={{ color: GOLD_L }}>tonight.</span>
        </h2>
        <p
          style={{
            marginTop: 22, fontSize: 'clamp(15px,2vw,18px)',
            color: 'rgba(255,250,236,0.88)', maxWidth: 600,
            marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55,
          }}
        >
          Join thousands of devotees who already trust ReligioGram for their
          sacred rituals, daily guidance, and spiritual community.
        </p>
        <Link
          href="/auth"
          style={{
            display: 'inline-block', marginTop: 34,
            padding: '16px 42px',
            background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
            color: NAVY,
            borderRadius: 14, textDecoration: 'none',
            fontWeight: 800, fontSize: 17,
            boxShadow: '0 8px 28px rgba(200,146,10,0.45)',
          }}
        >
          Create your free account →
        </Link>
        <p style={{ marginTop: 16, fontSize: 12.5, color: 'rgba(255,250,236,0.6)' }}>
          Free forever · No credit card · Works on phone, tablet, desktop
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────  FOOTER  ───────────────────────── */

function Footer() {
  return (
    <footer
      style={{
        background: NAVY,
        color: 'rgba(255,250,236,0.78)',
        padding: '52px 24px 30px',
        borderTop: '1px solid rgba(200,146,10,0.18)',
      }}
    >
      <div
        style={{
          maxWidth: 1180, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'space-between',
        }}
      >
        <div style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 8,
                backgroundImage: `url('/logo-icon-512.png')`,
                backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                backgroundColor: NAVY_2,
              }}
            />
            <span
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 22, fontWeight: 800, color: CREAM,
              }}
            >
              ReligioGram
            </span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,250,236,0.65)' }}>
            India's multi-faith spiritual marketplace — verified priests, AI
            astrologer, sacred places, devotee community.
          </p>
        </div>

        <FooterCol title="Product" links={[
          { label: 'Get started',   href: '/auth' },
          { label: 'Find priests',  href: '/auth' },
          { label: 'RG AI',         href: '/auth' },
          { label: 'Sacred places', href: '/auth' },
        ]} />

        <FooterCol title="Company" links={[
          { label: 'About',   href: '/terms' },
          { label: 'Contact', href: 'mailto:support@religiogram.in' },
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms',   href: '/terms' },
        ]} />

        <FooterCol title="Legal" links={[
          { label: 'Privacy policy',   href: '/privacy' },
          { label: 'Terms of service', href: '/terms' },
          { label: 'Delete account',   href: '/delete-account' },
        ]} />
      </div>

      <div
        style={{
          maxWidth: 1180, margin: '32px auto 0',
          paddingTop: 20, borderTop: '1px solid rgba(255,250,236,0.10)',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
          gap: 10, fontSize: 12.5, color: 'rgba(255,250,236,0.55)',
        }}
      >
        <div>© 2026 ReligioGram. All rights reserved.</div>
        <div>Made with devotion in India 🪔</div>
      </div>
    </footer>
  );
}

function FooterCol({
  title, links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontWeight: 800, color: CREAM, marginBottom: 12, fontSize: 13.5, letterSpacing: '0.04em' }}>
        {title}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              style={{
                color: 'rgba(255,250,236,0.7)', textDecoration: 'none',
                fontSize: 13.5,
              }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────  MEDIA HELPERS  ───────────────────────── */

function BackgroundVideo({
  src,
  opacity = 1,
  overlayStrength = 0.4,
  fit = 'cover',
}: {
  src: string;
  opacity?: number;
  overlayStrength?: number;
  /** "cover" fills the section, cropping if needed (best for hero with
   *  cinematic footage). "contain" shows the entire video without cropping
   *  — letterbox bars get filled by the navy section background. */
  fit?: 'cover' | 'contain';
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    // Some Android browsers ignore the autoplay attribute on first load until
    // a user interaction. Calling play() after mount maximises the chance the
    // background video starts immediately.
    ref.current?.play().catch(() => {});
  }, []);
  // Lighter top, darker bottom so text remains readable but the video shows
  // through clearly. overlayStrength controls the bottom darkness (0 = no
  // overlay, 1 = solid).
  const top = (overlayStrength * 0.4).toFixed(2);
  const bot = (overlayStrength * 0.9).toFixed(2);
  return (
    <>
      <video
        ref={ref}
        src={src}
        autoPlay loop muted playsInline preload="metadata"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: fit,
          opacity,
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, rgba(10,22,40,${top}) 0%, rgba(10,22,40,${bot}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

function InlineVideo({ src, orientation }: { src: string; orientation: 'portrait' | 'landscape' }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { ref.current?.play().catch(() => {}); }, []);
  const aspect = orientation === 'portrait' ? '9 / 16' : '16 / 9';
  const maxW   = orientation === 'portrait' ? 320 : 560;
  return (
    <div
      style={{
        width: '100%', maxWidth: maxW,
        aspectRatio: aspect,
        borderRadius: 22,
        overflow: 'hidden',
        background: NAVY,
        boxShadow: '0 16px 60px rgba(15,36,82,0.18), 0 4px 18px rgba(200,146,10,0.15)',
        border: '1px solid rgba(200,146,10,0.25)',
      }}
    >
      <video
        ref={ref}
        src={src}
        autoPlay loop muted playsInline preload="metadata"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
