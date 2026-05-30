'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';

const GOLD  = '#C8920A';
const NAVY  = '#1B2A5C';
const BG    = '#FFFBF0';
const TEXT  = '#1A0800';
const TEXT2 = '#4A3010';
const TEXT3 = '#8B6B35';
const GREY  = '#9CA3AF';

interface Props {
  onComplete: () => void;
}

const CITY_OPTIONS = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad'];

const FAITH_OPTIONS = [
  { key: 'all',       icon: '🌐', label: 'All Faiths' },
  { key: 'hindu',     icon: '🕉️', label: 'Hindu' },
  { key: 'muslim',    icon: '☪️',  label: 'Muslim' },
  { key: 'sikh',      icon: '🪯',  label: 'Sikh' },
  { key: 'christian', icon: '✝️',  label: 'Christian' },
  { key: 'other',     icon: '🙏', label: 'Other' },
];

const LANGUAGES = ['Hindi', 'English', 'Urdu', 'Punjabi', 'Tamil', 'Telugu', 'Bengali', 'Marathi'];
const GENDERS   = ['Prefer not to say', 'Male', 'Female', 'Other'];

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '20px 0 10px' }}>
      {Array.from({ length: total }).map((_, i) => {
        const done   = i < current - 1;
        const active = i === current - 1;
        return (
          <div
            key={i}
            style={{
              width:        done || active ? 10 : 8,
              height:       done || active ? 10 : 8,
              borderRadius: '50%',
              background:   done ? GOLD : active ? 'transparent' : '#D1D5DB',
              border:       active ? `2.5px solid ${GOLD}` : done ? 'none' : '1.5px solid #D1D5DB',
              transition:   'all 0.2s',
            }}
          />
        );
      })}
    </div>
  );
}

export default function OnboardingFlow({ onComplete }: Props) {
  const { accessToken } = useAuthStore();
  const [step, setStep] = useState(1);

  // Step 2
  const [faith, setFaith] = useState('all');
  // Step 3
  const [cityValue, setCityValue]           = useState('');
  const [locationGranted, setLocationGranted] = useState(false);
  const [showCityInput, setShowCityInput]   = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  // Step 4
  const [phone, setPhone]     = useState('');
  const [otpSent, setOtpSent] = useState(false);
  // Step 5
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState('Hindi');
  const [gender, setGender]     = useState('Prefer not to say');
  const [dob, setDob]           = useState('');
  // Step 6
  const [notif, setNotif] = useState({ push: true, sms: true, whatsapp: false, email: true });

  const TOTAL_STEPS = 6;

  const goNext = () => {
    if (step === 2) localStorage.setItem('rg_user_religion', faith);
    setStep((s: any) => Math.min(s + 1, TOTAL_STEPS));
  };

  // Skip auth step when already logged in
  useEffect(() => {
    if (step === 4 && accessToken) setStep(5);
  }, [step, accessToken]);

  const handleLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => { setLocationGranted(true); },
        () => { setShowCityInput(true); }
      );
    } else {
      setShowCityInput(true);
    }
  };

  const handleCityInput = (val: string) => {
    setCityValue(val);
    if (val.length > 0) {
      setCitySuggestions(CITY_OPTIONS.filter(c => c.toLowerCase().startsWith(val.toLowerCase())));
    } else {
      setCitySuggestions([]);
    }
  };

  const btnStyle = (disabled = false): React.CSSProperties => ({
    display:     'block',
    width:       '100%',
    padding:     '15px 0',
    background:  disabled ? '#E5E7EB' : GOLD,
    color:       disabled ? GREY : '#fff',
    fontWeight:  700,
    fontSize:    16,
    border:      'none',
    borderRadius: 14,
    cursor:      disabled ? 'not-allowed' : 'pointer',
    fontFamily:  '"Plus Jakarta Sans",sans-serif',
    letterSpacing: '0.01em',
  });

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '12px 14px',
    borderRadius: 10,
    border:       `1.5px solid ${NAVY}`,
    fontSize:     15,
    background:   '#fff',
    color:        TEXT,
    fontFamily:   '"Plus Jakarta Sans",sans-serif',
    outline:      'none',
    boxSizing:    'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize:    13,
    fontWeight:  600,
    color:       TEXT2,
    marginBottom: 6,
    display:     'block',
    fontFamily:  '"Plus Jakarta Sans",sans-serif',
  };

  const renderStep = () => {
    switch (step) {

      /* ── Step 1: Welcome ────────────────────────────────────────── */
      case 1:
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 24px 24px' }}>
            <div style={{
              width: 160, height: 160, borderRadius: '50%', marginBottom: 28,
              background: 'radial-gradient(ellipse, rgba(200,146,10,0.22) 0%, rgba(200,146,10,0.05) 70%, transparent 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 80 }}>🙏</span>
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', textAlign: 'center', marginBottom: 10, lineHeight: 1.25 }}>
              Welcome to ReligioGram
            </h1>
            <p style={{ fontSize: 14, color: TEXT2, textAlign: 'center', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.65, marginBottom: 28, maxWidth: 300 }}>
              Connect with trusted spiritual guides, priests &amp; consultants. All faiths. Verified providers.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 36, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['4.8★ Rated', '50K+ Bookings', '12 Faiths'].map(chip => (
                <div key={chip} style={{
                  background:   'rgba(200,146,10,0.12)',
                  border:       '1px solid rgba(200,146,10,0.35)',
                  borderRadius: 20,
                  padding:      '5px 14px',
                  fontSize:     12.5,
                  fontWeight:   700,
                  color:        '#7A5A00',
                  fontFamily:   '"Plus Jakarta Sans",sans-serif',
                }}>
                  {chip}
                </div>
              ))}
            </div>

            <button style={btnStyle()} onClick={goNext}>Get Started</button>
          </div>
        );

      /* ── Step 2: Faith Preference ───────────────────────────────── */
      case 2:
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px 24px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginBottom: 6 }}>
              Select your faith
            </h2>
            <p style={{ fontSize: 13, color: GREY, fontFamily: '"Plus Jakarta Sans",sans-serif', marginBottom: 22 }}>
              (You can always explore all faiths)
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 'auto' }}>
              {FAITH_OPTIONS.map(f => {
                const selected = faith === f.key;
                return (
                  <button key={f.key} onClick={() => setFaith(f.key)} style={{
                    background:   selected ? 'rgba(200,146,10,0.10)' : '#fff',
                    border:       `2px solid ${selected ? GOLD : '#E5E7EB'}`,
                    borderRadius: 16,
                    padding:      '20px 12px',
                    display:      'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    cursor:       'pointer',
                    transition:   'all 0.15s',
                  }}>
                    <span style={{ fontSize: 32 }}>{f.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: selected ? GOLD : TEXT, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{f.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ paddingTop: 24 }}>
              <button style={btnStyle()} onClick={goNext}>Continue</button>
            </div>
          </div>
        );

      /* ── Step 3: Location ───────────────────────────────────────── */
      case 3:
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 24px 24px' }}>
            <span style={{ fontSize: 72, marginBottom: 20 }}>📍</span>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginBottom: 14, textAlign: 'center' }}>
              Find providers near you
            </h2>

            <div style={{ alignSelf: 'stretch', marginBottom: 28 }}>
              {['• Nearby priests and pandits', '• Travel fee calculation', '• Local festival services'].map(b => (
                <div key={b} style={{ fontSize: 14, color: TEXT2, fontFamily: '"Plus Jakarta Sans",sans-serif', padding: '6px 0', lineHeight: 1.5 }}>
                  {b}
                </div>
              ))}
            </div>

            {locationGranted ? (
              <div style={{ background: 'rgba(34,197,94,0.10)', border: '1.5px solid rgba(34,197,94,0.4)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, alignSelf: 'stretch', textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#166534' }}>
                ✅ Location access granted!
              </div>
            ) : (
              <button style={{ ...btnStyle(), marginBottom: 12, alignSelf: 'stretch' }} onClick={handleLocation}>
                Allow Location
              </button>
            )}

            {!locationGranted && (
              <button onClick={() => setShowCityInput(true)} style={{ background: 'none', border: 'none', color: GREY, fontSize: 14, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif', marginBottom: 16 }}>
                Enter city manually
              </button>
            )}

            {showCityInput && (
              <div style={{ alignSelf: 'stretch', position: 'relative', marginBottom: 16 }}>
                <input
                  placeholder="Type your city..."
                  value={cityValue}
                  onChange={e => handleCityInput(e.target.value)}
                  style={inputStyle}
                />
                {citySuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                    {citySuggestions.map((c: any) => (
                      <div key={c} onClick={() => { setCityValue(c); setCitySuggestions([]); }} style={{ padding: '12px 14px', cursor: 'pointer', fontSize: 14, color: TEXT, fontFamily: '"Plus Jakarta Sans",sans-serif', borderBottom: '1px solid #F3F4F6' }}>
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 'auto', alignSelf: 'stretch' }}>
              <button style={btnStyle()} onClick={goNext}>Continue</button>
            </div>
          </div>
        );

      /* ── Step 4: Auth ───────────────────────────────────────────── */
      case 4:
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '30px 24px 24px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginBottom: 6 }}>
              Sign in to ReligioGram
            </h2>
            <p style={{ fontSize: 13, color: GREY, fontFamily: '"Plus Jakarta Sans",sans-serif', marginBottom: 24 }}>
              Access bookings, wallet and personalised guides
            </p>

            <label style={labelStyle}>Phone number</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{ ...inputStyle, width: 56, padding: '12px 8px', textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: NAVY }}>
                +91
              </div>
              <input
                type="tel"
                placeholder="Enter mobile number"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={10}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            {otpSent && (
              <div style={{ background: 'rgba(200,146,10,0.10)', border: '1px solid rgba(200,146,10,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7A5A00', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                OTP sent to +91 {phone}
              </div>
            )}

            <button style={btnStyle(phone.length !== 10)} disabled={phone.length !== 10} onClick={() => setOtpSent(true)}>
              {otpSent ? 'Resend OTP' : 'Send OTP'}
            </button>

            <button onClick={() => setStep(5)} style={{ background: 'none', border: 'none', color: GREY, fontSize: 13, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif', marginTop: 16, textAlign: 'center' }}>
              I&apos;ll sign in later
            </button>
          </div>
        );

      /* ── Step 5: Profile ────────────────────────────────────────── */
      case 5:
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px 24px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginBottom: 6 }}>
              Tell us about yourself
            </h2>
            <p style={{ fontSize: 13, color: GREY, fontFamily: '"Plus Jakarta Sans",sans-serif', marginBottom: 22 }}>
              Personalise your spiritual experience
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 'auto' }}>
              <div>
                <label style={labelStyle}>Full name <span style={{ color: 'red' }}>*</span></label>
                <input placeholder="Enter your full name" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input placeholder="Your city" value={cityValue} onChange={e => setCityValue(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Primary language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...inputStyle, appearance: 'none' as const }}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)} style={{ ...inputStyle, appearance: 'none' as const }}>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date of birth <span style={{ color: GREY, fontWeight: 400 }}>(optional)</span></label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ paddingTop: 24 }}>
              <button style={btnStyle(!fullName.trim())} disabled={!fullName.trim()} onClick={goNext}>Save &amp; Continue</button>
              <button onClick={goNext} style={{ background: 'none', border: 'none', color: GREY, fontSize: 13, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans",sans-serif', marginTop: 12, textAlign: 'center', width: '100%' }}>
                Skip for now
              </button>
            </div>
          </div>
        );

      /* ── Step 6: Notifications ──────────────────────────────────── */
      case 6: {
        type NotifKey = 'push' | 'sms' | 'whatsapp' | 'email';
        const rows: { key: NotifKey; icon: string; label: string; desc: string }[] = [
          { key: 'push',     icon: '🔔', label: 'Push notifications', desc: 'Booking updates, session reminders'     },
          { key: 'sms',      icon: '📱', label: 'SMS alerts',          desc: 'Critical only: OTP, confirmed bookings' },
          { key: 'whatsapp', icon: '💬', label: 'WhatsApp updates',    desc: 'Booking details, provider contact'       },
          { key: 'email',    icon: '📧', label: 'Email',               desc: 'Receipts and statements'                },
        ];
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '30px 24px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 72 }}>🔔</span>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', marginTop: 12, marginBottom: 8 }}>
                Stay updated
              </h2>
              <p style={{ fontSize: 13, color: TEXT2, fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.6 }}>
                Never miss a booking confirmation or session reminder
              </p>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {rows.map((item, i) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0', borderBottom: i < rows.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: TEXT3, fontFamily: '"Plus Jakarta Sans",sans-serif', marginTop: 2 }}>{item.desc}</div>
                  </div>
                  <button
                    onClick={() => setNotif((n: any) => ({ ...n, [item.key]: !n[item.key] }))}
                    style={{
                      width: 48, height: 28, borderRadius: 14,
                      background: notif[item.key] ? GOLD : '#D1D5DB',
                      border: 'none', cursor: 'pointer', position: 'relative',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                    aria-label={`Toggle ${item.label}`}
                  >
                    <div style={{
                      position: 'absolute', top: 3,
                      left: notif[item.key] ? 23 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ paddingTop: 24 }}>
              <button style={btnStyle()} onClick={onComplete}>Done! Start Exploring</button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StepDots current={step} total={TOTAL_STEPS} />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {renderStep()}
      </div>
    </div>
  );
}
