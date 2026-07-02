'use client';

/**
 * /astrology/horoscope — pick your sign.
 *
 * Grid of 12 zodiac sign cards. Each links to /astrology/horoscope/[sign]
 * where the real daily reading is fetched from the existing backend
 * /astrology/horoscope/:sign endpoint.
 */

import Link from 'next/link';
import { ZODIAC_SIGNS } from '@/lib/astrology-api';

const NAVY   = '#0F2452';
const NAVY_2 = '#1B2A5C';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

export default function HoroscopeHub() {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div style={{ background: CREAM, minHeight: '100svh', paddingBottom: 80 }}>
      {/* Header */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: CREAM,
        padding: '20px 20px 32px',
        borderRadius: '0 0 24px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 20, right: 30, fontSize: 60, opacity: 0.10 }}>♊</div>
        <div style={{ position: 'absolute', top: 80, right: 90, fontSize: 40, opacity: 0.10 }}>♌</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/astrology" style={{ color: CREAM, textDecoration: 'none', fontSize: 22, fontWeight: 700 }}>
            ←
          </Link>
        </div>

        <p style={{
          fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: GOLD_L, fontWeight: 700, margin: '20px 0 6px',
        }}>
          {today}
        </p>
        <h1 style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 28, fontWeight: 800, margin: 0,
          letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          Today's Horoscope
        </h1>
        <p style={{ fontSize: 13.5, color: 'rgba(255,250,236,0.80)', margin: '10px 0 0', maxWidth: 400 }}>
          Choose your zodiac sign for a personalised daily reading — plus
          lucky number, colour, direction and remedy.
        </p>
      </section>

      {/* Signs grid */}
      <section style={{ padding: '20px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
        }}>
          {ZODIAC_SIGNS.map((z) => (
            <Link
              key={z.name}
              href={`/astrology/horoscope/${z.name}`}
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                padding: '18px 14px',
                textDecoration: 'none',
                border: '1px solid rgba(15,36,82,0.08)',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 4px 12px rgba(15,36,82,0.05)',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: `${z.color}18`, color: z.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, flexShrink: 0,
              }}>
                {z.symbol}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
                  {z.label}
                </div>
                <div style={{ fontSize: 11, color: TEXT2, marginTop: 2 }}>
                  {z.dateRange}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ padding: '10px 20px 20px' }}>
        <Link
          href="/astrology/browse"
          style={{
            display: 'block',
            background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
            color: NAVY,
            padding: '15px 18px',
            borderRadius: 14,
            textDecoration: 'none',
            fontSize: 14, fontWeight: 800,
            textAlign: 'center',
            boxShadow: '0 10px 28px rgba(200,146,10,0.4)',
          }}
        >
          Want a deeper reading? Talk to an Astrologer →
        </Link>
      </section>
    </div>
  );
}
