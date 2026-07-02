'use client';

/**
 * /astrology/horoscope/[sign] — daily reading for a single zodiac sign.
 *
 * Fetches the reading from the existing backend endpoint
 * GET /astrology/horoscope/:sign. Falls back to a graceful placeholder
 * if the network is unreachable so the page never appears broken.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchHoroscope, ZODIAC_SIGNS, type Horoscope } from '@/lib/astrology-api';

const NAVY   = '#0F2452';
const NAVY_2 = '#1B2A5C';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT   = '#1A0800';
const TEXT2  = '#4A3010';

export default function SignReading() {
  const params = useParams<{ sign: string }>();
  const sign = params?.sign?.toLowerCase() ?? '';
  const meta = ZODIAC_SIGNS.find((z) => z.name === sign);

  const [data, setData] = useState<Horoscope | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!sign) return;
    setLoading(true);
    fetchHoroscope(sign).then((h) => {
      if (cancelled) return;
      setData(h);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sign]);

  if (!meta) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: TEXT2 }}>
        Unknown zodiac sign.
        <div style={{ marginTop: 20 }}>
          <Link href="/astrology/horoscope" style={{ color: GOLD, fontWeight: 700 }}>
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div style={{ background: CREAM, minHeight: '100svh', paddingBottom: 80 }}>
      {/* Header */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: CREAM,
        padding: '18px 20px 28px',
        borderRadius: '0 0 24px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -20, right: -20,
          fontSize: 180, color: `${meta.color}30`, lineHeight: 1,
        }}>
          {meta.symbol}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/astrology/horoscope" style={{ color: CREAM, textDecoration: 'none', fontSize: 22, fontWeight: 700 }}>
            ←
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `${meta.color}30`, color: meta.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, border: `2px solid ${meta.color}60`,
          }}>
            {meta.symbol}
          </div>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD_L, fontWeight: 700, margin: 0 }}>
              {today}
            </p>
            <h1 style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 30, fontWeight: 800, margin: '4px 0 0',
              letterSpacing: '-0.02em',
            }}>
              {meta.label}
            </h1>
            <p style={{ fontSize: 12.5, margin: '4px 0 0', color: 'rgba(255,250,236,0.75)' }}>
              {meta.dateRange}
              {data && ` · ${data.element} · ${data.rulingPlanet}`}
            </p>
          </div>
        </div>
      </section>

      {/* Reading */}
      <section style={{ padding: '18px 20px 4px' }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: 16,
          padding: 18,
          border: `1px solid ${meta.color}30`,
          boxShadow: '0 8px 20px rgba(15,36,82,0.06)',
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: GOLD, fontWeight: 800,
          }}>
            Today's Reading
          </div>
          <p style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 16, lineHeight: 1.65, color: TEXT,
            margin: '10px 0 0', fontWeight: 400,
          }}>
            {loading ? 'Reading the stars…'
             : data?.reading || 'A calm, reflective day awaits — trust your instincts and take one deliberate step forward.'}
          </p>
        </div>
      </section>

      {/* Lucky grid */}
      {data && (
        <section style={{ padding: '18px 16px 4px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}>
            <LuckyCard label="Lucky Colour"    value={data.luckyColor}    accent={meta.color} icon="🎨" />
            <LuckyCard label="Lucky Number"    value={String(data.luckyNumber)} accent={meta.color} icon="🔢" />
            <LuckyCard label="Lucky Time"      value={data.luckyTime}     accent={meta.color} icon="⏰" />
            <LuckyCard label="Lucky Direction" value={data.luckyDirection}accent={meta.color} icon="🧭" />
          </div>
        </section>
      )}

      {/* Remedy */}
      {data?.remedy && (
        <section style={{ padding: '18px 20px 4px' }}>
          <h2 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 17, fontWeight: 700, color: NAVY,
            margin: '0 0 10px',
          }}>Today's Remedy</h2>
          <div style={{
            background: `${GOLD}15`,
            border: `1px solid ${GOLD}40`,
            borderRadius: 14,
            padding: 14,
            fontSize: 14, color: TEXT2, lineHeight: 1.55,
          }}>
            🪔 {data.remedy}
          </div>
        </section>
      )}

      {/* Compatibility */}
      {data && data.compatibility.length > 0 && (
        <section style={{ padding: '18px 20px 4px' }}>
          <h2 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 17, fontWeight: 700, color: NAVY,
            margin: '0 0 10px',
          }}>Compatible With</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.compatibility.map((c) => {
              const cMeta = ZODIAC_SIGNS.find((z) => z.name === c.toLowerCase());
              if (!cMeta) return null;
              return (
                <Link
                  key={c}
                  href={`/astrology/horoscope/${cMeta.name}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px',
                    background: '#FFFFFF',
                    border: '1px solid rgba(15,36,82,0.12)',
                    borderRadius: 999,
                    textDecoration: 'none',
                    fontSize: 13, fontWeight: 700, color: NAVY,
                  }}
                >
                  <span style={{ color: cMeta.color }}>{cMeta.symbol}</span>
                  {cMeta.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Personality traits */}
      {data && data.traits.length > 0 && (
        <section style={{ padding: '18px 20px 4px' }}>
          <h2 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 17, fontWeight: 700, color: NAVY,
            margin: '0 0 10px',
          }}>Personality Traits</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.traits.map((t) => (
              <span key={t} style={{
                padding: '5px 10px',
                background: `${meta.color}15`,
                color: NAVY,
                border: `1px solid ${meta.color}30`,
                borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ padding: '24px 20px 0' }}>
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
          Want a deeper personalised reading? →
        </Link>
      </section>
    </div>
  );
}

function LuckyCard({
  label, value, accent, icon,
}: { label: string; value: string; accent: string; icon: string }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 14,
      padding: '14px 14px 12px',
      border: `1px solid ${accent}30`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: `${accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: TEXT2, fontWeight: 700,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}
