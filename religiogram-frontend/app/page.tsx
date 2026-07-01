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

      <WhatWeOfferSection authed={authed} />

      <WhyChooseSection authed={authed} />

      <PopularDestinationsSection authed={authed} />

      <HowItWorksSection />

      <SectionDivider />

      <ClosingCTA />

      <Footer />
    </main>
  );
}

/* ─────────────────────────  NAV BAR  ───────────────────────── */

function NavBar({ authed }: { authed: boolean }) {
  const NAV_LINKS = [
    { label: 'Home',        href: '#top' },
    { label: 'Priests',     href: authed ? '/priests' : '/auth' },
    { label: 'Holy Places', href: authed ? '/places'  : '/auth' },
    { label: 'Community',   href: authed ? '/social'  : '/auth' },
    { label: 'About',       href: '#features' },
    { label: 'Contact',     href: 'mailto:support@religiogram.in' },
  ];
  return (
    <header
      id="top"
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
          padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 20,
        }}
      >
        {/* Brand */}
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

        {/* Center nav — hidden below 900px via CSS */}
        <nav className="rg-nav-links" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              style={{
                color: NAVY,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                letterSpacing: '-0.01em',
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Login / Open App button — shown on both desktop and mobile. */}
        <Link
          href={authed ? '/home' : '/auth'}
          style={{
            padding: '10px 22px',
            background: `linear-gradient(135deg,${NAVY_2},${NAVY})`,
            color: CREAM,
            textDecoration: 'none',
            borderRadius: 12,
            fontWeight: 700, fontSize: 14,
            border: `1px solid ${GOLD}30`,
            boxShadow: '0 2px 10px rgba(15,36,82,0.18)',
            whiteSpace: 'nowrap',
          }}
        >
          {authed ? 'Open App' : 'Login'}
        </Link>
      </div>

      <style>{`
        /* Hide the centre nav links below 900px. Login button stays visible
           on all viewports (per user request). */
        @media (max-width: 899px) {
          .rg-nav-links { display: none !important; }
        }
      `}</style>
    </header>
  );
}

/* ─────────────────────────  HERO  ───────────────────────── */

function Hero({ authed }: { authed: boolean }) {
  const target = authed ? '/home' : '/auth';
  return (
    <section
      className="rg-hero-section"
      style={{
        position: 'relative',
        // Desktop dimensions match the earlier design the user approved;
        // mobile gets its own taller framing via CSS media query below.
        minHeight: 'clamp(560px, 78svh, 820px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: NAVY,
      }}
    >
      {/* Mobile: static hero-mobile.jpg background image via CSS.
          Desktop: cinematic looping desktop-hero.mp4 video overlaid on top
          of the section (mobile image is hidden underneath so nothing
          bleeds through). */}
      <style>{`
        .rg-hero-section {
          background-image:
            linear-gradient(180deg,
              rgba(253,246,227,0.72) 0%,
              rgba(253,246,227,0.42) 22%,
              rgba(253,246,227,0.12) 40%,
              rgba(253,246,227,0) 55%
            ),
            url('/hero-mobile.jpg');
          background-size: cover;
          background-position: center;
        }
        .rg-hero-video { display: none; }
        .rg-hero-video-overlay { display: none; }
        @media (min-width: 900px) {
          .rg-hero-section {
            background-image: none;
            background-color: ${NAVY};
          }
          .rg-hero-video {
            display: block;
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            z-index: 0;
          }
          /* No overlay on the video anymore — we removed the H1 overlay, so
             the video's own baked-in text no longer needs a lightened
             background. Keep the layer as a passthrough for structure. */
          .rg-hero-video-overlay {
            display: block;
            position: absolute;
            inset: 0;
            z-index: 1;
            background: transparent;
            pointer-events: none;
          }
          /* The video already contains the headline text — hide the
             overlay <h1> on desktop so it doesn't collide with what's
             already in the footage. Mobile still shows the H1 since it
             uses a static image without any baked-in text. */
          .rg-hero-title { display: none !important; }
          /* With the H1 hidden the button would jump to the top of the
             content well; push it into the mid-lower area of the hero
             so it sits under the video's baked-in headline instead. */
          .rg-hero-cta { margin-top: clamp(280px, 34vh, 380px) !important; }
        }
      `}</style>

      {/* Desktop-only cinematic video */}
      <video
        className="rg-hero-video"
        src="/landing/desktop-hero.mp4"
        autoPlay loop muted playsInline preload="metadata"
        aria-hidden="true"
      />
      <div className="rg-hero-video-overlay" aria-hidden="true" />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 780,
          padding: 'clamp(48px, 8vw, 96px) 24px 40px',
          textAlign: 'center',
          color: NAVY,
        }}
      >
        <h1
          className="rg-hero-title"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(34px, 5.6vw, 62px)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            margin: 0,
            color: NAVY,
          }}
        >
          Your Spiritual Journey<br />
          Starts Here
        </h1>
        {/* Subtitle removed per user request — heading + CTA carry the hero. */}
        {/* Extra top-margin on mobile pushes the button down past the temple
            domes and into the calmer reflection-pool area. Desktop uses less
            space since the composition is landscape and horizontal room is
            plentiful. */}
        <div className="rg-hero-cta" style={{ marginTop: 160 }}>
          <Link
            href={target}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '15px 34px',
              background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`,
              color: '#FFFFFF',
              borderRadius: 999,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 16,
              boxShadow: '0 12px 30px rgba(200,146,10,0.45)',
              letterSpacing: '-0.01em',
            }}
          >
            Explore Spiritual Services
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
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
        padding: '110px 24px',
        background: reverse ? '#FFF6E0' : CREAM,
        borderTop: '1px solid rgba(200,146,10,0.12)',
      }}
    >
      <div
        style={{
          maxWidth: 1180, margin: '0 auto',
          display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row',
          gap: 72, alignItems: 'center', flexWrap: 'wrap',
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
  mobileVideoSrc,
  eyebrow,
  title,
  body,
  bullets,
  align = 'left',
}: {
  videoSrc: string;
  /** Mobile-only override served for viewports <768px. Lets us ship a
   *  portrait phone-shot recording on mobile and a cinematic 16:9 on desktop. */
  mobileVideoSrc?: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  /** Which half of the screen the copy sits on. The video pans to the
   *  opposite side via object-position so footage and text don't fight. */
  align?: 'left' | 'right';
}) {
  // Stacked layout uses the video at its natural framing — no need for a
  // directional gradient or off-centre object-position any more.
  const videoPos = 'center center';
  // `align` retained in props for backward compatibility but unused now.
  void align;
  return (
    <section className="rg-fbg">
      {/*
        Scoped styles: stack on mobile (video at top, text in a solid navy
        block below), overlay on desktop (video fills section, text overlaid
        with a directional gradient). Single component, two layouts — no
        duplicate copy needed.
      */}
      <style>{`
        .rg-fbg { background: ${NAVY}; overflow: hidden; }

        /* ──── MOBILE (default) — stacked, no overlap ────
           No max-height: the 9:16 aspect-ratio dictates the full height so
           the entire portrait video is visible without clipping. */
        .rg-fbg-video-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          background: ${NAVY};
          overflow: hidden;
        }
        .rg-fbg-grad { display: none; }
        .rg-fbg-text {
          padding: 36px 24px 56px;
          color: ${CREAM};
          background: ${NAVY};
        }
        .rg-fbg-text-inner { max-width: 560px; margin: 0 auto; }

        /* ──── DESKTOP (≥768px) — STACKED, same pattern as mobile ────
           Video on top at 16:9 with a sensible max height + max width so it
           doesn't dominate huge monitors. Text below in solid navy block.
           No overlap → no clash with text baked into the video. */
        @media (min-width: 768px) {
          .rg-fbg-video-wrap {
            aspect-ratio: 16 / 9;
            max-width: 1200px;
            max-height: 70svh;
            margin: 0 auto;
          }
          .rg-fbg-text {
            padding: 64px 48px 80px;
          }
          .rg-fbg-text-inner { max-width: 720px; margin: 0 auto; }
        }
      `}</style>

      <div className="rg-fbg-video-wrap">
        <BackgroundVideo
          src={videoSrc}
          mobileSrc={mobileVideoSrc}
          opacity={1}
          overlayStrength={0}
          objectPosition={videoPos}
        />
        <div className="rg-fbg-grad" />
      </div>

      <div className="rg-fbg-text">
        <div className="rg-fbg-text-inner">
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
              fontSize: 'clamp(28px,4.8vw,52px)',
              fontWeight: 800, lineHeight: 1.1, margin: '0 0 18px',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,250,236,0.88)', margin: 0 }}>
            {body}
          </p>
          <ul
            style={{
              marginTop: 22, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 11,
            }}
          >
            {bullets.map((b) => (
              <li
                key={b}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  fontSize: 14.5, color: CREAM,
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
      </div>
    </section>
  );
}

/* ─────────────────────────  WHAT WE OFFER  ───────────────────────── */

/**
 * Marquee feature section. Replaces the previous full-bg video with a
 * card-based layout showing the three primary product pillars — Verified
 * Priests, Holy Places, Faith Community. Every CTA points to /auth (or
 * /home if the visitor already has a session), so users can go from
 * "interested" → "signed in" in a single click.
 */
function WhatWeOfferSection({ authed }: { authed: boolean }) {
  const target = authed ? '/home' : '/auth';
  const cards = [
    {
      title: 'Verified Priests',
      body: 'Find verified spiritual leaders for ceremonies, blessings, rituals, and personalised guidance.',
      icon: (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-3.31 3.58-6 8-6s8 2.69 8 6" />
          <path d="M18 5l2 2 3-3" />
        </svg>
      ),
      href: target,
    },
    {
      title: 'Holy Places',
      body: 'Discover renowned holy places and spiritual destinations rich in history, culture, and faith.',
      icon: (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      ),
      href: target,
    },
    {
      title: 'Faith Community',
      body: 'Connect with like-minded individuals, share experiences and grow together through faith.',
      icon: (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.4" />
          <path d="M3 20c0-2.76 2.69-5 6-5" />
          <path d="M13 20c0-2.21 1.79-4 4-4s4 1.79 4 4" />
        </svg>
      ),
      href: target,
    },
  ];

  return (
    <section
      id="features"
      style={{
        background: CREAM,
        padding: '110px 24px',
        borderTop: '1px solid rgba(200,146,10,0.12)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
        {/* Eyebrow pill */}
        <span
          style={{
            display: 'inline-block',
            padding: '6px 18px',
            borderRadius: 999,
            background: 'rgba(200,146,10,0.14)',
            border: '1px solid rgba(200,146,10,0.28)',
            color: GOLD,
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          What We Offer
        </span>

        {/* Heading */}
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(28px, 4.8vw, 52px)',
            fontWeight: 800,
            color: NAVY,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            margin: '22px 0 20px',
          }}
        >
          Everything You Need<br />
          For Your Spiritual Journey
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: 'clamp(14.5px, 1.6vw, 17px)',
            color: TEXT2,
            lineHeight: 1.65,
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          Whether you&apos;re planning a religious ceremony, seeking spiritual
          guidance, discovering holy places, or connecting with your faith
          community, ReligioGram provides trusted resources and meaningful
          experiences tailored to your beliefs and traditions.
        </p>

        {/* Primary CTA */}
        <Link
          href={target}
          style={{
            display: 'inline-block',
            marginTop: 32,
            padding: '14px 36px',
            background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`,
            color: NAVY,
            borderRadius: 999,
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: 15,
            boxShadow: '0 10px 26px rgba(200,146,10,0.35)',
          }}
        >
          Explore Services
        </Link>

        {/* Feature cards grid */}
        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 24,
            textAlign: 'left',
          }}
        >
          {cards.map((c) => (
            <div
              key={c.title}
              style={{
                background: CREAM,
                border: '1.5px solid rgba(15,36,82,0.14)',
                borderRadius: 18,
                padding: '32px 26px 28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <h3
                style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: 22,
                  fontWeight: 700,
                  color: NAVY,
                  margin: '0 0 16px',
                  letterSpacing: '-0.01em',
                }}
              >
                {c.title}
              </h3>
              <div style={{ marginBottom: 18 }}>{c.icon}</div>
              <p
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: TEXT2,
                  margin: '0 0 22px',
                }}
              >
                {c.body}
              </p>
              <Link
                href={c.href}
                style={{
                  color: NAVY,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                  marginTop: 'auto',
                }}
              >
                Learn More →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  WHY CHOOSE RELIGIOGRAM  ───────────────────────── */

/**
 * Side-by-side section: photograph on the left, headline + description +
 * CTA on the right. Reinforces the brand values after the feature grid.
 * Mobile stacks the two columns vertically (image on top).
 */
function WhyChooseSection({ authed }: { authed: boolean }) {
  const target = authed ? '/home' : '/auth';
  return (
    <section
      style={{
        background: CREAM,
        padding: '90px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 56,
          alignItems: 'center',
        }}
      >
        {/* Image */}
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 5',
            maxWidth: 520,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundImage: `url('/why-choose-hero.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: NAVY,
            boxShadow: '0 20px 50px -18px rgba(15,36,82,0.28)',
          }}
        />

        {/* Copy */}
        <div>
          {/* Eyebrow pill (centered on desktop within column) */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 18px',
                borderRadius: 999,
                background: 'rgba(200,146,10,0.14)',
                border: '1px solid rgba(200,146,10,0.28)',
                color: GOLD,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Why Choose ReligioGram
            </span>
          </div>

          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(28px, 4.5vw, 46px)',
              fontWeight: 800,
              color: NAVY,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              margin: '0 0 22px',
            }}
          >
            Built on Trust,<br />
            Faith &amp; Connection
          </h2>

          <p
            style={{
              fontSize: 'clamp(14.5px, 1.5vw, 16.5px)',
              color: TEXT2,
              lineHeight: 1.65,
              margin: '0 0 28px',
              maxWidth: 560,
            }}
          >
            ReligioGram brings together trusted religious experts, sacred
            destinations, and vibrant faith communities in one place. Whether
            you&apos;re seeking guidance, exploring holy places, or building
            meaningful connections, our platform is designed to make every
            spiritual journey more accessible, authentic, and enriching.
          </p>

          <Link
            href={target}
            style={{
              display: 'inline-block',
              padding: '14px 34px',
              background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`,
              color: NAVY,
              borderRadius: 999,
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: 15,
              boxShadow: '0 10px 26px rgba(200,146,10,0.35)',
            }}
          >
            Discover More
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  POPULAR DESTINATIONS  ───────────────────────── */

/**
 * Card grid showing 3 marquee holy destinations. Each card has an image,
 * faith-symbol badge, name, location, blurb, and Explore More link that
 * routes into the app's places browser.
 */
function PopularDestinationsSection({ authed }: { authed: boolean }) {
  const target = authed ? '/places' : '/auth';
  const destinations = [
    {
      name: 'Golden Temple',
      location: 'Amritsar, Punjab, India',
      body: 'The holiest Sikh shrine, renowned for its golden architecture, peaceful surroundings, and spiritual significance.',
      image: '/golden-temple.jpg',
      symbol: (
        // Sikh Khanda
        <svg width="18" height="18" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
          <path d="M12 2c-.6 0-1 .5-1 1v5c-1.2.4-2 1.5-2 2.8 0 .8.3 1.6.8 2.1L8 15h1.5l1-2c.5.1 1 .1 1.5 0l1 2H14l-1.8-2.1c.5-.5.8-1.3.8-2.1 0-1.3-.8-2.4-2-2.8V3c0-.5-.4-1-1-1zm-6 16h12v2H6v-2z"/>
        </svg>
      ),
    },
    {
      name: 'Vaishno Devi',
      location: 'Jammu & Kashmir, India',
      body: "One of India's most sacred pilgrimage sites, renowned for its spiritual significance and breathtaking mountain setting.",
      image: '/vaishno-devi.jpg',
      symbol: (
        // Om
        <svg width="18" height="18" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
          <path d="M14.5 8c-1.5 0-2.5 1-2.5 2.5S13 13 14.5 13s2.5-1 2.5-2.5S16 8 14.5 8zm-5 5c-2.2 0-4 1.6-4 3.5s1.8 3.5 4 3.5c1.2 0 2.3-.5 3-1.3.6.8 1.5 1.3 2.5 1.3 1.9 0 3.5-1.6 3.5-3.5 0-.8-.3-1.6-.8-2.2h-2c.5.4.8 1 .8 1.7 0 1.1-.9 2-2 2s-2-.9-2-2v-2h-1.5v2c0 1-.7 1.8-1.5 1.9v-.4c0-1.1-.9-2-2-2H4l1.3 1.4c.6-.3 1.3-.4 2-.4 1.1 0 2 .8 2 1.6 0 .9-.9 1.4-2 1.4-.8 0-1.5-.3-2-.7L4 15c.8.9 2.1 1.5 3.5 1.5H8v.5c0 .3.2.5.5.5s.5-.2.5-.5v-4z"/>
          <circle cx="19" cy="6" r="1.5"/>
        </svg>
      ),
    },
    {
      name: 'Sacred Heart Cathedral',
      location: 'New Delhi, India',
      body: 'A historic cathedral known for its beautiful architecture and peaceful spiritual atmosphere.',
      image: '/sacred-heart.jpg',
      symbol: (
        // Christian cross
        <svg width="18" height="18" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
          <path d="M10 3h4v6h6v4h-6v8h-4v-8H4V9h6z"/>
        </svg>
      ),
    },
  ];

  return (
    <section
      style={{
        background: CREAM,
        padding: '90px 24px',
        borderTop: '1px solid rgba(200,146,10,0.12)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
        {/* Eyebrow pill */}
        <span
          style={{
            display: 'inline-block',
            padding: '6px 18px',
            borderRadius: 999,
            background: 'rgba(200,146,10,0.14)',
            border: '1px solid rgba(200,146,10,0.28)',
            color: GOLD,
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Popular Destinations
        </span>

        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(28px, 4.8vw, 52px)',
            fontWeight: 800,
            color: NAVY,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            margin: '22px 0 20px',
          }}
        >
          Explore Sacred<br />
          Places Around The World
        </h2>

        <p
          style={{
            fontSize: 'clamp(14.5px, 1.6vw, 16.5px)',
            color: TEXT2,
            lineHeight: 1.65,
            maxWidth: 720,
            margin: '0 auto 56px',
          }}
        >
          Explore renowned holy places from different faiths, each offering
          unique stories, spiritual significance, cultural heritage, and
          unforgettable experiences that deepen your connection with faith
          and tradition.
        </p>

        {/* Cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            textAlign: 'left',
          }}
        >
          {destinations.map((d) => (
            <div
              key={d.name}
              style={{
                background: '#FFFFFF',
                borderRadius: 18,
                overflow: 'hidden',
                boxShadow: '0 12px 30px -14px rgba(15,36,82,0.20)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Photo + symbol badge overlay */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  backgroundImage: `url('${d.image}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: NAVY,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    bottom: -18,
                    left: 22,
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: CREAM,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(15,36,82,0.15)',
                  }}
                >
                  {d.symbol}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '32px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontSize: 22,
                    fontWeight: 700,
                    color: NAVY,
                    margin: '0 0 8px',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {d.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>
                  </svg>
                  <span style={{ fontSize: 12.5, color: TEXT2, fontWeight: 600 }}>{d.location}</span>
                </div>
                <p
                  style={{
                    fontSize: 14, lineHeight: 1.55, color: TEXT2,
                    margin: '0 0 20px', flex: 1,
                  }}
                >
                  {d.body}
                </p>
                <Link
                  href={target}
                  style={{
                    color: NAVY, fontSize: 13.5, fontWeight: 700,
                    textDecoration: 'none', marginTop: 'auto',
                  }}
                >
                  Explore More →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  HOW IT WORKS  ───────────────────────── */

/**
 * Simple 3-step explainer that de-mystifies the flow: discover → book →
 * connect. Each step is a circular icon with a numbered gold badge; on
 * desktop a thin gold rule connects them left-to-right. Mobile stacks
 * vertically (no connector line — visual clutter on a phone).
 */
function HowItWorksSection() {
  const steps = [
    {
      n: 1,
      title: 'Discover',
      body: 'Browse trusted leaders and sacred destinations across faiths.',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      ),
    },
    {
      n: 2,
      title: 'Book',
      body: 'Pick a service, date and time. Confirm in just a few taps.',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
          <path d="m9.5 10.5 2 2 4-4" />
        </svg>
      ),
    },
    {
      n: 3,
      title: 'Connect',
      body: 'Meet a verified leader and receive a meaningful experience.',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 17l-3-3 5-5 5 5-3 3" />
          <path d="M13 9l3-3 4 4-3 3" />
          <path d="M8 14l-3 3 4 4 3-3" />
          <path d="M13 14l-2 2" />
        </svg>
      ),
    },
  ];

  return (
    <section
      style={{
        background: CREAM,
        padding: '90px 24px 110px',
        borderTop: '1px solid rgba(200,146,10,0.12)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        {/* Eyebrow pill */}
        <span
          style={{
            display: 'inline-block',
            padding: '6px 18px',
            borderRadius: 999,
            background: 'rgba(200,146,10,0.14)',
            border: '1px solid rgba(200,146,10,0.28)',
            color: GOLD,
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          How It Works
        </span>

        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(28px, 4.5vw, 46px)',
            fontWeight: 800,
            color: NAVY,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            margin: '22px 0 60px',
          }}
        >
          Three quiet steps to a<br />
          sacred experience
        </h2>

        {/* Steps row with connector line on desktop */}
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 36,
            alignItems: 'start',
          }}
          className="rg-steps"
        >
          {/* Connector line — absolute, only visible on desktop via CSS */}
          <div className="rg-steps-line" aria-hidden="true" />

          {steps.map((s) => (
            <div
              key={s.n}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
              {/* Icon circle + number badge */}
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <div
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: '50%',
                    background: CREAM,
                    border: `1.5px solid ${GOLD}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 20px -8px rgba(15,36,82,0.20)',
                  }}
                >
                  {s.icon}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`,
                    color: NAVY,
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(200,146,10,0.4)',
                  }}
                >
                  {s.n}
                </div>
              </div>

              <h3
                style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: 22,
                  fontWeight: 700,
                  color: NAVY,
                  margin: '0 0 10px',
                  letterSpacing: '-0.01em',
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: TEXT2,
                  margin: 0,
                  maxWidth: 260,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Connector line styling — desktop only */}
        <style>{`
          .rg-steps-line { display: none; }
          @media (min-width: 720px) {
            .rg-steps-line {
              display: block;
              position: absolute;
              top: 37px;              /* half of icon-circle height (74/2) */
              left: 12%;
              right: 12%;
              height: 1px;
              background: linear-gradient(90deg, transparent, ${GOLD}80 15%, ${GOLD}80 85%, transparent);
              z-index: 1;
            }
          }
        `}</style>
      </div>
    </section>
  );
}

/* ─────────────────────────  SECTION DIVIDER  ───────────────────────── */

/** Cream-coloured breathing-room band between two full-bg video sections.
 *  Without this the cinematic sections butt up against each other and the
 *  page feels visually crowded. A thin gold rule keeps the brand language
 *  consistent with the rest of the site. */
function SectionDivider() {
  return (
    <div
      style={{
        background: CREAM,
        padding: '56px 24px',
        display: 'flex', justifyContent: 'center',
      }}
      aria-hidden="true"
    >
      <div
        style={{
          width: 120, height: 2,
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          opacity: 0.55,
        }}
      />
    </div>
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
      {/* Closing CTA is now text-only — the Popular Destinations section
          above already shows the sacred-places content the section4 video
          used to loop through. */}
      <div
        style={{
          maxWidth: 820, padding: '44px 24px 64px',
          textAlign: 'center', color: CREAM,
          marginLeft: 'auto', marginRight: 'auto',
        }}
      >
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px,5vw,52px)',
            fontWeight: 800, lineHeight: 1.12, margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Begin your devotion journey.
        </h2>
        <p
          style={{
            marginTop: 16, fontSize: 'clamp(14px,2vw,17px)',
            color: 'rgba(255,250,236,0.78)', maxWidth: 520,
            marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55,
          }}
        >
          Thousands of devotees already trust ReligioGram for their sacred
          rituals, daily guidance, and spiritual community.
        </p>
        <Link
          href="/auth"
          style={{
            display: 'inline-block', marginTop: 28,
            padding: '14px 32px',
            background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
            color: NAVY,
            borderRadius: 12, textDecoration: 'none',
            fontWeight: 800, fontSize: 15.5,
            boxShadow: '0 8px 28px rgba(200,146,10,0.4)',
          }}
        >
          Create your free account →
        </Link>
        <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,250,236,0.55)' }}>
          Free forever · No credit card
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
  mobileSrc,
  opacity = 1,
  overlayStrength = 0.4,
  fit = 'cover',
  objectPosition = 'center center',
}: {
  src: string;
  /** Optional mobile-specific source. When the viewport is <768px wide we
   *  prefer this so we can ship vertical phone-shot footage on mobile and
   *  cinematic 16:9 footage on desktop without compromise. */
  mobileSrc?: string;
  opacity?: number;
  overlayStrength?: number;
  /** "cover" fills the section, cropping if needed (best for hero with
   *  cinematic footage). "contain" shows the entire video without cropping
   *  — letterbox bars get filled by the navy section background. */
  fit?: 'cover' | 'contain';
  /** CSS object-position. Lets a parent shift which part of a cropped
   *  video stays visible (e.g. "85% center" pushes content to the right). */
  objectPosition?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // Pick mobile vs desktop source ONCE on mount. Re-checking on resize would
  // cause the video to restart mid-scroll which is jarring.
  const [resolvedSrc, setResolvedSrc] = useState(src);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    setResolvedSrc(isMobile && mobileSrc ? mobileSrc : src);
  }, [src, mobileSrc]);
  useEffect(() => {
    // Some Android browsers ignore the autoplay attribute on first load until
    // a user interaction. Calling play() after mount maximises the chance the
    // background video starts immediately.
    ref.current?.play().catch(() => {});
  }, [resolvedSrc]);
  // Lighter top, darker bottom so text remains readable but the video shows
  // through clearly. overlayStrength controls the bottom darkness (0 = no
  // overlay, 1 = solid).
  const top = (overlayStrength * 0.4).toFixed(2);
  const bot = (overlayStrength * 0.9).toFixed(2);
  return (
    <>
      <video
        ref={ref}
        // `key` forces React to recreate the <video> when the source flips
        // mobile↔desktop, so the new file is actually loaded instead of the
        // browser silently keeping the first one.
        key={resolvedSrc}
        src={resolvedSrc}
        autoPlay loop muted playsInline preload="metadata"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: fit,
          objectPosition,
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
