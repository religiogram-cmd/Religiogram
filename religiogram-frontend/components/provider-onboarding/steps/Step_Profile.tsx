'use client';

/**
 * Step_Profile — experience, bio, languages, Sanskrit toggle, per-minute rate.
 *
 * Fields:
 *   - experienceYears: numeric 0–50
 *   - bio: textarea 500 chars with counter
 *   - languages: multi-select pill chips
 *   - sanskritKnowledge: toggle (Hindu only)
 *   - perMinutePaise: shown only for online/both service mode
 */

import { useEffect, useMemo, useState } from 'react';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { formatRupees } from '@/lib/format-currency';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

const GOLD = '#C8932A';
const NAVY = '#0F2452';

const LANGUAGES = [
  'Hindi', 'English', 'Tamil', 'Telugu', 'Kannada', 'Marathi',
  'Gujarati', 'Punjabi', 'Urdu', 'Arabic', 'Malayalam', 'Bengali',
];

/** Per-minute rate ranges based on experience years (in paise). */
function rateRange(expYears: number): { min: number; max: number } {
  if (expYears < 2)  return { min: 1000,  max: 3000  }; // ₹10–₹30/min
  if (expYears < 5)  return { min: 2000,  max: 6000  }; // ₹20–₹60/min
  if (expYears < 10) return { min: 4000,  max: 10000 }; // ₹40–₹100/min
  if (expYears < 20) return { min: 6000,  max: 15000 }; // ₹60–₹150/min
  return               { min: 10000, max: 30000 };       // ₹100–₹300/min
}

function paise2rupees(p: number): number { return Math.round(p / 100); }
function rupees2paise(r: string): number {
  const n = parseFloat(r.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

interface Props {
  onCanContinueChange?: (v: boolean) => void;
}

export default function Step_Profile({ onCanContinueChange }: Props) {
  const { data, update } = useProviderOnboarding();
  const serviceMode = (data as any).serviceMode as string | undefined;
  const showOnlineFields = serviceMode === 'online' || serviceMode === 'both';
  const showSanskrit = data.religion === 'hindu';

  const [exp, setExp]         = useState<number>(data.experienceYears ?? 0);
  const [bio, setBio]         = useState(data.bio ?? '');
  const [langs, setLangs]     = useState<string[]>(data.languages ?? []);
  const [sanskrit, setSanskrit] = useState<boolean>((data as any).sanskritKnowledge ?? false);
  const [rateRupees, setRateRupees] = useState<string>(() => {
    const p = (data as any).perMinutePaise as number | undefined;
    if (p) return String(paise2rupees(p));
    const range = rateRange(data.experienceYears ?? 0);
    return String(paise2rupees(range.min));
  });

  const range = useMemo(() => rateRange(exp), [exp]);

  // Sync → store
  useEffect(() => {
    const patch: Record<string, unknown> = {
      experienceYears: exp,
      bio,
      languages: langs,
      sanskritKnowledge: sanskrit,
    };
    if (showOnlineFields) {
      patch.perMinutePaise = rupees2paise(rateRupees);
    }
    update(patch as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp, bio, langs, sanskrit, rateRupees, showOnlineFields]);

  const canContinue = langs.length > 0 && bio.trim().length >= 10;
  useEffect(() => { onCanContinueChange?.(canContinue); }, [canContinue, onCanContinueChange]);

  const toggleLang = (l: string) => {
    setLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  // Clamp rate when exp changes
  useEffect(() => {
    const r = rateRange(exp);
    const cur = rupees2paise(rateRupees);
    if (cur < r.min) setRateRupees(String(paise2rupees(r.min)));
    if (cur > r.max) setRateRupees(String(paise2rupees(r.max)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp]);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 15,
    border: '1.5px solid #E5E7EB', borderRadius: 10, outline: 'none',
    color: '#111827', background: '#FAFAFA', boxSizing: 'border-box',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };

  return (
    <div>
      <h2 style={{
        fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6,
        fontFamily: "'Playfair Display',Georgia,serif",
      }}>
        Tell seekers about yourself
      </h2>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 28, lineHeight: 1.6 }}>
        A complete profile gets 3× more bookings.
      </p>

      {/* Experience years */}
      <div style={{ marginBottom: 22 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, letterSpacing: '0.03em' }}>
          Years of experience
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            type="range" min={0} max={50} value={exp}
            onChange={(e) => setExp(Number(e.target.value))}
            style={{ flex: 1, accentColor: GOLD }}
          />
          <div style={{
            minWidth: 56, textAlign: 'center', padding: '8px 12px',
            background: `${GOLD}18`, borderRadius: 10,
            fontSize: 16, fontWeight: 800, color: '#92680A',
          }}>
            {exp === 0 ? '<1' : exp}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
          <span>0 years</span>
          <span>50 years</span>
        </div>
      </div>

      {/* Bio */}
      <div style={{ marginBottom: 22 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, letterSpacing: '0.03em' }}>
          About you <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(min 10 chars)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 500))}
          placeholder="Describe your training, lineage, experience and what makes your rituals special…"
          rows={4}
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: bio.length >= 450 ? '#EF4444' : '#9CA3AF', marginTop: 3 }}>
          {bio.length}/500
        </div>
      </div>

      {/* Languages */}
      <div style={{ marginBottom: 22 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 10, letterSpacing: '0.03em' }}>
          Languages you speak <span style={{ fontWeight: 400, color: '#EF4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => {
            const active = langs.includes(l);
            return (
              <button
                key={l}
                onClick={() => toggleLang(l)}
                aria-pressed={active}
                style={{
                  padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${active ? GOLD : '#E5E7EB'}`,
                  background: active ? `${GOLD}18` : '#fff',
                  color: active ? '#92680A' : '#6B7280',
                  cursor: 'pointer', transition: 'all 0.15s', outline: 'none',
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
        {langs.length === 0 && (
          <p style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>
            Select at least one language.
          </p>
        )}
      </div>

      {/* Sanskrit toggle — Hindu only */}
      {showSanskrit && (
        <div style={{
          marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', borderRadius: 14, padding: '14px 18px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Sanskrit Knowledge</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              Can recite shlokas &amp; mantras in Sanskrit
            </div>
          </div>
          <button
            onClick={() => setSanskrit((v) => !v)}
            aria-checked={sanskrit}
            role="switch"
            style={{
              width: 48, height: 28, borderRadius: 14, border: 'none',
              background: sanskrit ? GOLD : '#E5E7EB',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 4, width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              left: sanskrit ? 24 : 4,
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      )}

      {/* Per-minute rate — online/both only */}
      {showOnlineFields && (
        <div style={{
          marginBottom: 22, background: '#FFFBEF', borderRadius: 14, padding: '18px',
          border: `1.5px solid ${GOLD}40`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
            Per-minute consultation rate
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>
            Based on your {exp} year{exp !== 1 ? 's' : ''} of experience,
            allowed range: {formatRupees(paise2rupees(range.min))} – {formatRupees(paise2rupees(range.max))} per minute
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: `1.5px solid ${GOLD}`, borderRadius: 10, background: '#fff', overflow: 'hidden',
            }}>
              <span style={{ padding: '10px 12px', fontSize: 15, color: '#92680A', fontWeight: 700 }}>₹</span>
              <input
                type="number"
                min={paise2rupees(range.min)}
                max={paise2rupees(range.max)}
                value={rateRupees}
                onChange={(e) => setRateRupees(e.target.value)}
                onBlur={() => {
                  const paise = rupees2paise(rateRupees);
                  const clamped = Math.max(range.min, Math.min(range.max, paise));
                  setRateRupees(String(paise2rupees(clamped)));
                }}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 15, width: 80, padding: '10px 8px', color: '#1F2937',
                  fontWeight: 700,
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>/ minute</span>
          </div>
        </div>
      )}
    </div>
  );
}
