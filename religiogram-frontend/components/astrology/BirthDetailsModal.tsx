'use client';

/**
 * BirthDetailsModal — first-visit birth-profile capture.
 *
 * Rendered by AstrologyScreen when the user has no saved birth profile and
 * hasn't tapped Skip in a previous session (localStorage key
 * `rg_astro_birth_skipped`). Submits directly to /v1/ai/birth-profile —
 * NOT the fake KundliTab flow, which the same code path used to double
 * as before this refactor.
 *
 * On successful save we fire a `wallet:refresh` window event so any mounted
 * WalletBadge re-fetches (the backend may issue a first-visit credit at
 * some point) — cheap enough that we always dispatch it.
 */

import { useState } from 'react';
import { birthProfile, type BirthProfileInput } from '@/lib/astrology-api';

const NAVY = '#0F2452';
const GOLD = '#C8932A';
const GOLD_L = '#E0A92F';
const CREAM = '#FFFAEC';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save. Modal is already closed by the
   *  time this fires, but the parent may want to trigger UI refreshes. */
  onSaved?: () => void;
}

export default function BirthDetailsModal({ open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<BirthProfileInput & { birthCountry: string }>({
    fullName: '',
    birthDate: '',
    birthTime: '',
    birthCity: '',
    birthCountry: 'India',
    timezone: 'Asia/Kolkata',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const canSubmit = !!(form.fullName.trim() && form.birthDate && form.birthCity.trim());

  const handleSkip = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('rg_astro_birth_skipped', '1');
      }
    } catch { /* private-mode / SSR — non-fatal */ }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      // birthCountry isn't in the backend schema — we bake it into the city
      // string so the astrologer sees "Delhi, India" rather than just "Delhi".
      const city = form.birthCountry && !form.birthCity.toLowerCase().includes(form.birthCountry.toLowerCase())
        ? `${form.birthCity.trim()}, ${form.birthCountry.trim()}`
        : form.birthCity.trim();
      await birthProfile.save({
        fullName:  form.fullName.trim(),
        birthDate: form.birthDate,
        birthTime: form.birthTime || undefined,
        birthCity: city,
        timezone:  form.timezone || 'Asia/Kolkata',
      });
      setSaved(true);
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new Event('wallet:refresh')); } catch { /* non-fatal */ }
      }
      // Small confirmation flash, then close.
      setTimeout(() => {
        setSaving(false);
        onClose();
        onSaved?.();
      }, 700);
    } catch (err: unknown) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : 'Could not save. Please try again.';
      setError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="birth-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,36,82,0.55)',
        display: 'flex', alignItems: 'flex-end',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480, margin: '0 auto',
          background: CREAM,
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 28px',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 -12px 40px rgba(15,36,82,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{
              margin: 0, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#94a3b8', fontWeight: 700,
            }}>Personalise your readings</p>
            <h2 id="birth-modal-title" style={{
              margin: '4px 0 0',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 20, fontWeight: 700, color: NAVY,
              letterSpacing: '-0.02em',
            }}>
              Your Birth Details <span style={{ color: GOLD }}>✦</span>
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#4A3010', lineHeight: 1.45 }}>
              Astrologers use these to prepare your chart before the call.
              You can update them anytime from Kundli.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 999,
              border: 'none', background: 'rgba(15,36,82,0.06)',
              color: NAVY, fontSize: 16, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {saved ? (
          <div style={{
            marginTop: 20,
            padding: '20px 16px',
            background: `${GOLD_L}20`,
            border: `1px solid ${GOLD}`,
            borderRadius: 12,
            textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: 22 }}>✅</p>
            <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 700, color: NAVY }}>
              Details saved
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#4A3010' }}>
              Astrologers will see your chart context when you connect.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
            <Field label="Full Name *">
              <input
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="e.g. Arjun Sharma"
                required
                autoFocus
                style={inputStyle}
              />
            </Field>

            <Field label="Date of Birth *">
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                required
                style={inputStyle}
              />
            </Field>

            <Field label="Time of Birth">
              <input
                type="time"
                value={form.birthTime}
                onChange={(e) => setForm((f) => ({ ...f, birthTime: e.target.value }))}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#94a3b8' }}>
                Exact time gives the most accurate chart. Approximate is OK.
              </p>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="City of Birth *">
                <input
                  value={form.birthCity}
                  onChange={(e) => setForm((f) => ({ ...f, birthCity: e.target.value }))}
                  placeholder="Delhi"
                  required
                  style={inputStyle}
                />
              </Field>
              <Field label="Country">
                <input
                  value={form.birthCountry}
                  onChange={(e) => setForm((f) => ({ ...f, birthCountry: e.target.value }))}
                  placeholder="India"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Timezone">
              <input
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="Asia/Kolkata"
                style={inputStyle}
              />
            </Field>

            {error && (
              <p style={{
                margin: '10px 0 0', fontSize: 12.5, color: '#dc2626',
                background: '#FEE2E2', border: '1px solid #FCA5A5',
                borderRadius: 8, padding: '8px 10px',
              }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                style={{
                  flex: 1, height: 46, borderRadius: 12,
                  background: 'transparent',
                  border: '1.5px solid rgba(15,36,82,0.18)',
                  color: NAVY, fontSize: 14, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >Skip for now</button>
              <button
                type="submit"
                disabled={!canSubmit || saving}
                style={{
                  flex: 2, height: 46, borderRadius: 12,
                  background: canSubmit
                    ? `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`
                    : '#e2e8f0',
                  color: canSubmit ? NAVY : '#94a3b8',
                  border: 'none',
                  fontSize: 14.5, fontWeight: 800,
                  cursor: canSubmit && !saving ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >{saving ? 'Saving…' : 'Save Details'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block', fontSize: 11.5, fontWeight: 700,
        color: '#4A3010', marginBottom: 5, letterSpacing: '0.02em',
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 10,
  border: '1.5px solid rgba(15,36,82,0.15)',
  padding: '0 12px',
  fontSize: 14,
  color: NAVY,
  background: '#FFFFFF',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
