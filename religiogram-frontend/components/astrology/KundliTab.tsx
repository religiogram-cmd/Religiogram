'use client';

/**
 * KundliTab — birth-details form + kundli result panel.
 *
 * Pre-fills from GET /v1/ai/birth-profile on mount; saves via POST on
 * submit. Result panel shows the real rashi / nakshatra / lagna returned
 * by the backend orchestrator. If those computed fields aren't back yet
 * we render a "Kundli is being generated…" state — the AI service
 * computes them asynchronously the first time a chart is requested.
 */

import { useEffect, useState } from 'react';
import { birthProfile, type BirthProfile } from '@/lib/astrology-api';

const NAVY = '#0F2452';
const GOLD = '#C8932A';

type Step = 'form' | 'result';

export default function KundliTab() {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({ name: '', dob: '', time: '', place: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<BirthProfile | null>(null);

  // Pre-fill form from the saved birth profile so users don't retype.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const p = await birthProfile.get();
        if (cancelled) return;
        if (p) {
          setProfile(p);
          setForm({
            name:  p.fullName ?? '',
            dob:   p.birthDate ?? '',
            time:  p.birthTime ?? '',
            place: p.birthCity ?? '',
          });
          // If we already have computed fields, jump straight to result view.
          if (p.rashi || p.nakshatra || p.lagna) setStep('result');
        }
      } catch { /* non-fatal — show empty form */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.dob || !form.place) return;
    setSaving(true);
    setError(null);
    try {
      await birthProfile.save({
        fullName:  form.name.trim(),
        birthDate: form.dob,
        birthTime: form.time || undefined,
        birthCity: form.place.trim(),
      });
      // Re-fetch to pick up the computed rashi/nakshatra/lagna the backend
      // populates asynchronously via KundliService.
      const fresh = await birthProfile.get();
      setProfile(fresh);
      setStep('result');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save your birth details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <div style={{
          width: 60, height: 60, border: `4px solid rgba(15,36,82,0.12)`,
          borderTopColor: NAVY, borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: NAVY, fontWeight: 700, fontSize: 15, margin: 0 }}>Loading…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (step === 'result') {
    const hasComputed = !!(profile?.rashi || profile?.nakshatra || profile?.lagna);

    return (
      <div style={{ background: '#F6F7FA', minHeight: '100%', paddingBottom: 100 }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
          padding: '16px 16px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => setStep('form')}
            style={{ border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Free Kundli</p>
            <p style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>{form.name || 'Your'}&apos;s Birth Chart</p>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          {/* Birth details card */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 2px 8px rgba(15,36,82,0.07)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Birth Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Name', value: form.name || '—' },
                { label: 'Date', value: form.dob || '—' },
                { label: 'Time', value: form.time || 'Not provided' },
                { label: 'Place', value: form.place || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#F6F7FA', borderRadius: 8, padding: '8px 10px' }}>
                  <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#374151' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {hasComputed ? (
            /* Rashi / Nakshatra / Lagna panel — real backend values */
            <div style={{
              background: `linear-gradient(135deg, ${NAVY}10, ${GOLD}15)`,
              borderRadius: 14, padding: 14, marginBottom: 12,
              border: `1px solid ${GOLD}40`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your Chart</p>
                {profile?.lagna && (
                  <span style={{ background: GOLD, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                    {profile.lagna} Lagna
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Rashi',     value: profile?.rashi     || '—' },
                  { label: 'Nakshatra', value: profile?.nakshatra || '—' },
                  { label: 'Lagna',     value: profile?.lagna     || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#fff', borderRadius: 8, padding: '9px 8px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: NAVY }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Backend hasn't computed the kundli yet — waiting state.
             * The chart is generated the first time an AI chat requests it
             * via KundliService; showing the user we know it's coming. */
            <div style={{
              background: '#fff', borderRadius: 14, padding: '24px 16px', marginBottom: 12,
              boxShadow: '0 2px 8px rgba(15,36,82,0.07)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 46, height: 46, border: `3px solid rgba(15,36,82,0.12)`,
                borderTopColor: GOLD, borderRadius: '50%',
                animation: 'spin 1.2s linear infinite',
              }} />
              <p style={{ margin: 0, color: NAVY, fontWeight: 700, fontSize: 14 }}>
                Kundli is being generated…
              </p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 260 }}>
                We&apos;ll calculate your rashi, nakshatra and lagna in the background.
                Refresh in a moment or ask RG AI to generate your chart.
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          <div style={{
            background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
            borderRadius: 14, padding: 16,
          }}>
            <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 700, fontSize: 14 }}>Want a deeper reading?</p>
            <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
              Consult a live astrologer for personalised remedies and predictions.
            </p>
            <button
              onClick={() => { window.location.href = '/astrology/browse'; }}
              style={{
                background: GOLD, color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                width: '100%',
              }}
            >
              Talk to an Astrologer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F6F7FA', minHeight: '100%', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
        padding: '20px 20px 24px',
      }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Birth Chart Generator</p>
        <p style={{ margin: '4px 0 0', color: '#fff', fontSize: 20, fontWeight: 800 }}>Free Kundli</p>
        <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Get your personalised Janam Kundali instantly</p>
      </div>

      <div style={{ padding: 16 }}>
        {/* Features */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20,
        }}>
          {[
            { icon: '🪐', label: 'Rashi Sign' },
            { icon: '✨', label: 'Nakshatra' },
            { icon: '⏱', label: 'Lagna (Ascendant)' },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              background: '#fff', borderRadius: 10, padding: '12px 8px', textAlign: 'center',
              boxShadow: '0 2px 8px rgba(15,36,82,0.07)',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 22 }}>{icon}</p>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: NAVY }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(15,36,82,0.08)' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: NAVY }}>Enter Birth Details</p>

          {[
            { key: 'name' as const, label: 'Full Name *', type: 'text', placeholder: 'e.g. Arjun Sharma', required: true },
            { key: 'dob' as const, label: 'Date of Birth *', type: 'date', placeholder: '', required: true },
            { key: 'time' as const, label: 'Time of Birth', type: 'time', placeholder: '', required: false },
            { key: 'place' as const, label: 'Place of Birth *', type: 'text', placeholder: 'e.g. Delhi, India', required: true },
          ].map(({ key, label, type, placeholder, required }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                required={required}
                style={{
                  width: '100%', height: 44, borderRadius: 10, border: '1.5px solid #e2e8f0',
                  padding: '0 12px', fontSize: 14, color: '#374151', background: '#F6F7FA',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}

          <p style={{ margin: '0 0 14px', fontSize: 11, color: '#94a3b8' }}>
            * Time of birth gives the most accurate results. If unknown, approximate time will be used.
          </p>

          {error && (
            <p style={{
              margin: '0 0 12px', fontSize: 12.5, color: '#dc2626',
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              borderRadius: 8, padding: '8px 10px',
            }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', height: 48, borderRadius: 12,
              background: saving ? '#94a3b8' : `linear-gradient(135deg, ${NAVY}, #0F2452)`,
              color: '#fff', border: 'none', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Generate Free Kundli'}
          </button>
        </form>
      </div>
    </div>
  );
}
