'use client';

/**
 * /become-provider — category chooser.
 *
 * Entry point that routes a would-be service provider into the right
 * onboarding wizard:
 *
 *   Priest    → /provider-onboarding                         (existing 9-step
 *                                                             wizard — unchanged)
 *   Astrologer→ /provider-onboarding?category=astrologer     (same wizard, but
 *                                                             wizard steps 3-5
 *                                                             render astro
 *                                                             variants)
 *
 * The existing /become-priest route continues to work as a direct link into
 * the priest flow so nothing that ships today breaks.
 */

import Link from 'next/link';

const NAVY   = '#0F2452';
const NAVY_2 = '#1B2A5C';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

export default function BecomeProviderChooser() {
  return (
    <div style={{
      background: CREAM,
      minHeight: '100svh',
      paddingBottom: 80,
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    }}>
      {/* Hero */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: CREAM,
        padding: '28px 20px 40px',
        borderRadius: '0 0 28px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 20, right: 30, width: 6, height: 6, borderRadius: '50%', background: GOLD_L, opacity: 0.7 }} />
        <div style={{ position: 'absolute', top: 60, right: 80, width: 3, height: 3, borderRadius: '50%', background: GOLD_L, opacity: 0.5 }} />
        <div style={{ position: 'absolute', top: 100, right: 50, width: 5, height: 5, borderRadius: '50%', background: GOLD_L, opacity: 0.6 }} />

        <p style={{
          fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: GOLD_L, fontWeight: 700, margin: 0,
        }}>
          Join ReligioGram
        </p>
        <h1 style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 'clamp(26px, 6vw, 36px)',
          fontWeight: 800, lineHeight: 1.1, margin: '10px 0 8px',
          letterSpacing: '-0.02em',
        }}>
          Share your gift.<br />
          Serve devotees.
        </h1>
        <p style={{
          fontSize: 14, lineHeight: 1.55, color: 'rgba(255,250,236,0.85)',
          margin: '0 0 4px', maxWidth: 460,
        }}>
          Priest or astrologer — pick the role that fits how you serve, and
          we&apos;ll walk you through the same 9-step onboarding.
        </p>
      </section>

      {/* Choose your role */}
      <section style={{ padding: '24px 20px 8px' }}>
        <h2 style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 20, fontWeight: 700, color: NAVY,
          margin: '0 0 16px', letterSpacing: '-0.01em',
        }}>
          What describes you best?
        </h2>

        <RoleCard
          href="/provider-onboarding"
          badge="Offline & Online"
          title="Priest / Pandit"
          subtitle="Pandit · Imam · Granthi · Priest · Purohit"
          bullets={[
            'Perform poojas, namaz, kirtan, mass, ceremonies',
            'Accept in-person bookings at customer\'s home / your venue',
            'Offer online video consultations for guidance & remedies',
          ]}
          icon="🕉️"
          gradient={`linear-gradient(135deg, #DC143C 0%, #8B0000 100%)`}
        />

        <RoleCard
          href="/provider-onboarding?category=astrologer"
          badge="Chat · Voice · Video"
          title="Astrologer"
          subtitle="Vedic · KP · Nadi · Tarot · Numerology · Palmistry"
          bullets={[
            'Consult over chat, voice or video — billed per minute',
            'Get followers, live sessions, and premium visibility',
            'Same KYC. Same trusted platform. Astrology-first tools.',
          ]}
          icon="✨"
          gradient={`linear-gradient(135deg, #6A5ACD 0%, #483D8B 100%)`}
        />
      </section>

      {/* Reassurance */}
      <section style={{ padding: '20px 20px' }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(15,36,82,0.08)',
          borderRadius: 16, padding: 18,
        }}>
          <h3 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 17, fontWeight: 700, color: NAVY,
            margin: '0 0 10px',
          }}>
            Same trusted process
          </h3>
          <p style={{
            fontSize: 13.5, lineHeight: 1.55, color: TEXT2,
            margin: '0 0 12px',
          }}>
            Whichever role you pick, we verify every provider before your
            listing goes live — so devotees know they&apos;re booking someone
            real.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {['PAN + selfie verification', '30-second video introduction', 'Bank account securely encrypted', 'Admin review within 24-48 hours'].map((t) => (
              <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: NAVY }}>
                <span style={{
                  color: GOLD, fontWeight: 800, fontSize: 14, flexShrink: 0,
                }}>✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function RoleCard({
  href, badge, title, subtitle, bullets, icon, gradient,
}: {
  href: string; badge: string; title: string; subtitle: string;
  bullets: string[]; icon: string; gradient: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: gradient,
        color: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        marginBottom: 14,
        textDecoration: 'none',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 12px 30px -14px rgba(15,36,82,0.35)',
      }}
    >
      <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 56, opacity: 0.28 }}>{icon}</div>

      <div style={{
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.28)',
        borderRadius: 999,
        fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
        fontWeight: 700, marginBottom: 12,
      }}>
        {badge}
      </div>

      <h3 style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: 24, fontWeight: 800, lineHeight: 1.1,
        margin: '0 0 4px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h3>
      <p style={{ fontSize: 12.5, margin: '0 0 14px', opacity: 0.85 }}>
        {subtitle}
      </p>

      <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {bullets.map((b) => (
          <li key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ opacity: 0.85, flexShrink: 0 }}>›</span>
            <span style={{ opacity: 0.92 }}>{b}</span>
          </li>
        ))}
      </ul>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px',
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.28)',
        borderRadius: 999,
        fontSize: 13.5, fontWeight: 700,
      }}>
        Continue as {title.split(' ')[0]}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </Link>
  );
}
