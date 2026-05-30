'use client';

import { useState } from 'react';

const NAVY = '#0F2452';
const GOLD = '#C8932A';

type Step = 'form' | 'result';

const PLANETS = [
  { name: 'Sun ☉',     house: 'I',    sign: 'Aries',    degree: '14°22\'', status: 'Exalted' },
  { name: 'Moon ☽',    house: 'VII',  sign: 'Libra',    degree: '3°48\'',  status: 'Neutral' },
  { name: 'Mars ♂',    house: 'IV',   sign: 'Cancer',   degree: '22°10\'', status: 'Debilitated' },
  { name: 'Mercury ☿', house: 'II',   sign: 'Taurus',   degree: '7°55\'',  status: 'Neutral' },
  { name: 'Jupiter ♃', house: 'IX',   sign: 'Sagittarius', degree: '19°30\'', status: 'Own' },
  { name: 'Venus ♀',   house: 'XII',  sign: 'Pisces',   degree: '28°00\'', status: 'Exalted' },
  { name: 'Saturn ♄',  house: 'X',    sign: 'Capricorn', degree: '11°40\'', status: 'Own' },
  { name: 'Rahu ☊',    house: 'III',  sign: 'Gemini',   degree: '16°15\'', status: 'Neutral' },
  { name: 'Ketu ☋',    house: 'IX',   sign: 'Sagittarius', degree: '16°15\'', status: 'Neutral' },
];

const DOSHAS = [
  { name: 'Mangal Dosha', present: false, severity: null, description: 'No Mangal Dosha detected in your chart.' },
  { name: 'Kaal Sarp Dosha', present: true, severity: 'Partial', description: 'Partial Kaal Sarp Dosha present. May cause minor obstacles. Remedy: Nag Panchami puja.' },
  { name: 'Pitru Dosha', present: false, severity: null, description: 'No Pitru Dosha. Ancestral blessings are favourable.' },
  { name: 'Sade Sati', present: false, severity: null, description: 'Not currently under Sade Sati influence.' },
];

export default function KundliTab() {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({ name: '', dob: '', time: '', place: '' });
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.dob) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep('result'); }, 1800);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <div style={{
          width: 60, height: 60, border: `4px solid rgba(15,36,82,0.12)`,
          borderTopColor: NAVY, borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: NAVY, fontWeight: 700, fontSize: 15, margin: 0 }}>Generating your Kundli…</p>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, textAlign: 'center', maxWidth: 220 }}>Calculating planetary positions and houses</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (step === 'result') {
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
            <p style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>{form.name || 'Your'}'s Birth Chart</p>
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

          {/* Lagna info */}
          <div style={{
            background: `linear-gradient(135deg, ${NAVY}10, ${GOLD}15)`,
            borderRadius: 14, padding: 14, marginBottom: 12,
            border: `1px solid ${GOLD}40`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Lagna (Ascendant)</p>
              <span style={{ background: GOLD, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Aries Lagna</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Rashi', value: 'Mesh (♈)' },
                { label: 'Nakshatra', value: 'Ashwini' },
                { label: 'Charan', value: '2nd' },
                { label: 'Moon Sign', value: 'Libra (♎)' },
                { label: 'Sun Sign', value: 'Aries (♈)' },
                { label: 'Tithi', value: 'Ekadashi' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#fff', borderRadius: 8, padding: '7px 8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: NAVY }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Planet positions */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 2px 8px rgba(15,36,82,0.07)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Planetary Positions</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F6F7FA' }}>
                    {['Planet', 'House', 'Sign', 'Degree', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontSize: 10.5, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLANETS.map((p, i) => (
                    <tr key={p.name} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFD', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 10px', color: NAVY, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{p.house}</td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{p.sign}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{p.degree}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, borderRadius: 5, padding: '2px 6px',
                          background: p.status === 'Exalted' ? '#dcfce7' : p.status === 'Own' ? '#dbeafe' : p.status === 'Debilitated' ? '#fee2e2' : '#f1f5f9',
                          color: p.status === 'Exalted' ? '#16a34a' : p.status === 'Own' ? '#1d4ed8' : p.status === 'Debilitated' ? '#dc2626' : '#64748b',
                        }}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Doshas */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 2px 8px rgba(15,36,82,0.07)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dosha Analysis</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DOSHAS.map(d => (
                <div key={d.name} style={{
                  background: d.present ? '#FFF5F5' : '#F0FDF4',
                  borderRadius: 10, padding: '10px 12px',
                  border: `1px solid ${d.present ? '#FCA5A5' : '#86EFAC'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>{d.present ? '⚠️' : '✅'}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: d.present ? '#dc2626' : '#16a34a' }}>
                      {d.name} {d.severity ? `(${d.severity})` : ''}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{d.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dasha */}
          <div style={{
            background: `linear-gradient(135deg, ${NAVY} 0%, #2c5282 100%)`,
            borderRadius: 14, padding: 16,
          }}>
            <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 700, fontSize: 14 }}>Current Mahadasha: Jupiter</p>
            <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Running until 2031 · Antardasha: Saturn</p>
            <button
              style={{
                background: GOLD, color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                width: '100%',
              }}
            >
              Get Expert Kundli Analysis ✨
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
            { icon: '🪐', label: 'Planet Positions' },
            { icon: '🔮', label: 'Dosha Analysis' },
            { icon: '⏱', label: 'Dasha Periods' },
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
                onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
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

          <button
            type="submit"
            style={{
              width: '100%', height: 48, borderRadius: 12,
              background: `linear-gradient(135deg, ${NAVY}, #0F2452)`,
              color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Generate Free Kundli 🔮
          </button>
        </form>
      </div>
    </div>
  );
}
