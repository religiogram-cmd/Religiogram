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

      <SectionDivider />

      <FullBgSection
        videoSrc="/landing/section2.mp4"
        mobileVideoSrc="/landing/mobile/m2-priests.mp4"
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

      <SectionDivider />

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
      {/* Desktop hero uses a dedicated cinematic clip; mobile keeps the
          portrait WhatsApp recording (m3-ai.mp4) so the mobile view is
          unchanged. */}
      <BackgroundVideo
        src="/landing/desktop-hero.mp4"
        mobileSrc="/landing/mobile/m3-ai.mp4"
        opacity={1}
        overlayStrength={0.35}
      />

      {/* Buttons removed from hero — primary CTA lives in the nav bar
          ("Sign In" / "Open App") and at the bottom of the page in the
          ClosingCTA. Letting the hero video breathe without overlay copy. */}
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
  // Directional gradient (DESKTOP only): dark on the copy side (so text is
  // legible), transparent on the opposite side (so the video reads cleanly).
  const grad =
    align === 'left'
      ? 'linear-gradient(90deg, rgba(10,22,40,0.82) 0%, rgba(10,22,40,0.60) 40%, rgba(10,22,40,0.10) 75%, rgba(10,22,40,0.00) 100%)'
      : 'linear-gradient(270deg, rgba(10,22,40,0.82) 0%, rgba(10,22,40,0.60) 40%, rgba(10,22,40,0.10) 75%, rgba(10,22,40,0.00) 100%)';
  // Push video footage away from the text side so it remains visible.
  const videoPos = align === 'left' ? '85% center' : '15% center';
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

        /* ──── DESKTOP (≥768px) — cinematic overlay ──── */
        @media (min-width: 768px) {
          .rg-fbg {
            position: relative;
            min-height: 88svh;
            display: flex;
            align-items: center;
          }
          .rg-fbg-video-wrap {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            aspect-ratio: auto;
            max-height: none;
          }
          .rg-fbg-grad {
            display: block;
            position: absolute; inset: 0;
            background: ${grad};
            pointer-events: none;
            z-index: 1;
          }
          .rg-fbg-text {
            position: relative; z-index: 2;
            max-width: 1280px;
            margin: 0 auto;
            padding: 100px 48px;
            background: transparent;
            width: 100%;
            display: flex;
            justify-content: ${align === 'left' ? 'flex-start' : 'flex-end'};
          }
          .rg-fbg-text-inner { max-width: 560px; margin: 0; }
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
      {/* Video stage — portrait (9:16) on mobile so the WhatsApp clip fills
          the screen edge-to-edge, 16:9 on desktop so the cinematic footage
          shows fully. `cover` keeps the frame full-bleed on both. */}
      {/* Mobile: 9:16 full width — portrait WhatsApp recording shows in full.
          Desktop: 16:9 capped by MAX-WIDTH (not max-height). This keeps the
          container exactly 16:9 so the video fits perfectly without any
          letterbox or crop, regardless of monitor height. */}
      <style>{`
        .rg-cta-video {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          overflow: hidden;
          background: ${NAVY};
        }
        @media (min-width: 768px) {
          .rg-cta-video {
            aspect-ratio: 16 / 9;
            max-width: 1200px;
            margin: 0 auto;
          }
        }
      `}</style>
      <div className="rg-cta-video">
        <BackgroundVideo
          src="/landing/section4.mp4"
          mobileSrc="/landing/mobile/m4-cta.mp4"
          opacity={1}
          overlayStrength={0.25}
          fit="cover"
        />
      </div>

      {/* CTA copy sits BELOW the video so nothing overlaps the footage. */}
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
          Begin your devotion journey{' '}
          <span style={{ color: GOLD_L }}>tonight.</span>
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
