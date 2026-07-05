'use client';

/**
 * /astrology/astrologer/[id] — astrologer profile.
 *
 * Sections: hero header (avatar, name, verification, live status), stats
 * strip (rating / experience / consultations), pricing card with 3 CTAs
 * (Chat / Voice / Video), about, specialisations, languages, awards,
 * reviews summary. Bottom sticky bar with primary Consult button.
 *
 * Phase 2 wires the Chat/Voice/Video buttons to the existing
 * consultation session engine (already scaffolded in the backend under
 * `src/consultation/`).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAstrologer, formatRupees, type Astrologer, type ConsultationChannel } from '@/lib/astrology-api';

const NAVY   = '#0F2452';
const NAVY_2 = '#1B2A5C';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

export default function AstrologerDetail() {
  const params = useParams<{ id: string }>();
  const [a, setA] = useState<Astrologer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    getAstrologer(params.id)
      .then((row) => { if (!cancelled) setA(row); })
      .catch(() => { if (!cancelled) setA(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params?.id]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <span aria-hidden style={{
          display: 'inline-block', width: 28, height: 28,
          borderRadius: '50%',
          border: '3px solid rgba(15,36,82,0.15)',
          borderTopColor: GOLD,
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!a) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: TEXT2 }}>
        Astrologer not found.
        <div style={{ marginTop: 20 }}>
          <Link href="/astrology/browse" style={{ color: GOLD, fontWeight: 700 }}>
            ← Back to browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CREAM, minHeight: '100svh', paddingBottom: 90 }}>
      {/* ── Header ── */}
      <section style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: CREAM,
        padding: '18px 20px 30px',
        borderRadius: '0 0 24px 24px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/astrology/browse" style={{ color: CREAM, textDecoration: 'none', fontSize: 22, fontWeight: 700 }}>
            ←
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 84, height: 84, borderRadius: '50%',
              background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: NAVY, fontWeight: 800, fontSize: 32,
              border: `3px solid ${GOLD_L}40`,
            }}>
              {a.name.split(' ').slice(-1)[0][0]}
            </div>
            {a.isOnline && (
              <div style={{
                position: 'absolute', bottom: 4, right: 4,
                width: 18, height: 18, borderRadius: '50%',
                background: a.isBusy ? '#F59E0B' : '#10B981',
                border: '3px solid #FFF',
              }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h1 style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 22, fontWeight: 700, margin: 0,
                letterSpacing: '-0.01em',
              }}>{a.name}</h1>
              {a.isVerified && (
                <span title="Verified" style={{
                  color: GOLD_L, fontSize: 16,
                }}>✓</span>
              )}
            </div>
            <p style={{ fontSize: 12, margin: '4px 0 0', color: 'rgba(255,250,236,0.75)' }}>
              {a.qualification}
            </p>
            <p style={{ fontSize: 12.5, margin: '4px 0 0', color: 'rgba(255,250,236,0.85)' }}>
              📍 {a.city}
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{
          marginTop: 22,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}>
          <Stat value={`${a.rating}★`} label={`${(a.reviewCount/1000).toFixed(1)}k reviews`} />
          <Stat value={`${a.experienceYears}y`} label="Experience" />
          <Stat value={`${(a.completedConsultations/1000).toFixed(1)}k`} label="Sessions" />
          <Stat value={`${a.successRate}%`} label="Success" />
        </div>
      </section>

      {/* ── Pricing + CTAs ── */}
      <section style={{ padding: '18px 20px 4px' }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(200,146,10,0.30)',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 8px 20px rgba(15,36,82,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEXT2, fontWeight: 700 }}>
                Consultation Rate
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: NAVY, lineHeight: 1.1, marginTop: 4 }}>
                {formatRupees(a.ratePerMinPaise)}<span style={{ fontSize: 13, fontWeight: 600, color: TEXT2 }}>/min</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: a.isOnline ? '#10B981' : TEXT2,
              }}>
                {a.isOnline ? (a.isBusy ? '● Busy' : '● Available now') : `Next: ${a.nextAvailableSlot}`}
              </div>
              <div style={{ fontSize: 10.5, color: TEXT2, marginTop: 2 }}>
                Avg response: {a.responseTimeSec}s
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(['chat', 'voice', 'video'] as ConsultationChannel[]).map((c) => {
              const enabled = a.channels.includes(c) && a.isOnline && !a.isBusy;
              /* Route to the shared `/consult/[providerId]` pre-session
               * screen (same one priests use). Chat and voice/video share
               * one wallet-hold + session engine — the query params tell
               * the pre-session screen which mode to open the call in.
               * `mode=chat` renders text UI; `mode=call` starts the
               * WebRTC session (audio-only for 'voice', camera on for
               * 'video' — the /consultation page reads `channel`). */
              const label = c === 'chat' ? 'Chat' : c === 'voice' ? 'Voice' : 'Video';
              const icon  = c === 'chat' ? '💬'  : c === 'voice' ? '📞'    : '🎥';
              const mode  = c === 'chat' ? 'chat' : 'call';
              const commonStyle: React.CSSProperties = {
                padding: '12px 6px',
                background: enabled
                  ? `linear-gradient(135deg,${GOLD_L},${GOLD})`
                  : '#F3F4F6',
                color: enabled ? NAVY : '#9CA3AF',
                border: 'none', borderRadius: 12,
                fontWeight: 800, fontSize: 13, cursor: enabled ? 'pointer' : 'not-allowed',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                boxShadow: enabled ? '0 6px 18px rgba(200,146,10,0.28)' : 'none',
                textDecoration: 'none',
              };
              if (!enabled) {
                return (
                  <button key={c} type="button" disabled style={commonStyle}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    {label}
                  </button>
                );
              }
              return (
                <Link
                  key={c}
                  href={`/consult/${a.id}?mode=${mode}&channel=${c}`}
                  style={commonStyle}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <Section title="About">
        <p style={{ fontSize: 14, lineHeight: 1.6, color: TEXT2, margin: 0 }}>
          {a.about}
        </p>
      </Section>

      {/* ── Specialisations ── */}
      <Section title="Specialisations">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {a.specializations.map((s) => (
            <span key={s} style={{
              padding: '6px 12px',
              background: `${GOLD}18`, color: NAVY,
              borderRadius: 999, fontSize: 12, fontWeight: 700,
              border: `1px solid ${GOLD}40`,
            }}>
              {s}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Languages ── */}
      <Section title="Languages">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {a.languages.map((l) => (
            <span key={l} style={{
              padding: '6px 12px', background: '#FFFFFF',
              border: '1px solid rgba(15,36,82,0.12)',
              borderRadius: 999, fontSize: 12, fontWeight: 600, color: NAVY,
            }}>
              {l}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Awards ── */}
      {a.awards.length > 0 && (
        <Section title="Awards & Recognition">
          <ul style={{ margin: 0, padding: '0 0 0 20px', color: TEXT2, fontSize: 13.5, lineHeight: 1.7 }}>
            {a.awards.map((aw) => <li key={aw}>{aw}</li>)}
          </ul>
        </Section>
      )}

      {/* ── Reviews summary ── */}
      <Section title="Reviews">
        <div style={{
          background: '#FFFFFF', borderRadius: 14, padding: 14,
          display: 'flex', alignItems: 'center', gap: 14,
          border: '1px solid rgba(15,36,82,0.08)',
        }}>
          <div style={{ textAlign: 'center', minWidth: 60 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
              {a.rating}
            </div>
            <div style={{ color: GOLD, fontSize: 13, marginTop: 2 }}>★★★★★</div>
            <div style={{ fontSize: 10.5, color: TEXT2, marginTop: 2 }}>
              {a.reviewCount.toLocaleString()} reviews
            </div>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: TEXT2, fontStyle: 'italic' }}>
            &ldquo;Deeply insightful reading — accurate predictions and
            practical remedies. Highly recommended.&rdquo;
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: NAVY, fontStyle: 'normal' }}>
              — verified consultation
            </div>
          </div>
        </div>
      </Section>

      {/* Sticky bottom CTA */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        padding: '10px 16px',
        background: 'rgba(255,250,236,0.95)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(15,36,82,0.08)',
        zIndex: 20,
      }}>
        {(() => {
          /* Primary CTA. When the astrologer is live + free we route to the
           * shared `/consult/[providerId]` pre-session screen. The mode
           * defaults to their first available channel — chat if they offer
           * it (cheapest and safest to bootstrap), else 'call'. */
          const available = a.isOnline && !a.isBusy;
          const defaultChannel: ConsultationChannel =
            a.channels.includes('chat')  ? 'chat'
          : a.channels.includes('voice') ? 'voice'
          :                                'video';
          const defaultMode = defaultChannel === 'chat' ? 'chat' : 'call';
          const baseStyle: React.CSSProperties = {
            width: '100%',
            padding: '15px 18px',
            background: available
              ? `linear-gradient(135deg,${GOLD_L},${GOLD})`
              : '#E5E7EB',
            color: available ? NAVY : '#6B7280',
            border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 800,
            cursor: available ? 'pointer' : 'not-allowed',
            boxShadow: available ? '0 10px 26px rgba(200,146,10,0.4)' : 'none',
            textAlign: 'center', textDecoration: 'none',
            display: 'block',
          };
          if (!available) {
            return (
              <button type="button" disabled style={baseStyle}>
                {a.isOnline
                  ? 'Currently Busy — Try Later'
                  : `Notify me when ${a.name.split(' ')[0]} is online`}
              </button>
            );
          }
          return (
            <Link
              href={`/consult/${a.id}?mode=${defaultMode}&channel=${defaultChannel}`}
              style={baseStyle}
            >
              Consult Now · {formatRupees(a.ratePerMinPaise)}/min
            </Link>
          );
        })()}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '20px 20px 4px' }}>
      <h2 style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: 17, fontWeight: 700, color: NAVY,
        margin: '0 0 10px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      background: 'rgba(255,250,236,0.10)',
      border: '1px solid rgba(255,250,236,0.15)',
      borderRadius: 12, padding: '10px 4px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: GOLD_L }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,250,236,0.70)', marginTop: 2, letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );
}
