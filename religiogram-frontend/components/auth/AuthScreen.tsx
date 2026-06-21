'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, ApiError, tokenStore } from '@/lib/api';
import { RGLogo } from '@/components/ui/RGLogo';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAVY = '#0F2452';
const NAVY_MID = '#0F2452';
const GOLD = '#C8932A';

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('rg_device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('rg_device_id', id); }
  return id;
}

function saveTokens(res: { tokens: { accessToken: string; refreshToken: string } }) {
  tokenStore.set(res.tokens.accessToken, res.tokens.refreshToken);
}

type Tab = 'phone' | 'email';

function makeFakeJwt(userId: string, role: string): string {
  if (process.env.NODE_ENV === 'production') { console.error('DevPanel disabled in production'); return ''; }
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const h = enc({ alg:'HS256', typ:'JWT' });
  const p = enc({ sub: userId, role, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400 });
  return `${h}.${p}.dev_sig_not_verified`;
}

const DEV_USERS = [
  { label:'Seeker',   role:'seeker',   id:'dev-seeker-001',   name:'Dev Seeker',   email:'seeker@dev.local'   },
  { label:'Provider', role:'provider', id:'dev-provider-001', name:'Dev Provider', email:'provider@dev.local' },
  { label:'Admin',    role:'admin',    id:'dev-admin-001',    name:'Dev Admin',    email:'admin@dev.local'    },
] as const;

function DevPanel({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();

  const loginAs = useCallback((u: typeof DEV_USERS[number]) => {
    tokenStore.set(makeFakeJwt(u.id, u.role), `dev-refresh-${u.id}-${u.role}`);
    // Identity is encoded in the JWT — no localStorage write needed
    const permsDone = typeof window !== 'undefined' ? localStorage.getItem('rg_permissions_done') : null;
    if (onSuccess) { onSuccess(); } else { router.replace(permsDone ? '/home' : '/permissions'); }
  }, [router, onSuccess]);

  return (
    <div style={{ marginTop: 20, borderRadius: 14, border: '1.5px dashed rgba(200,147,42,0.5)', background: 'rgba(200,147,42,0.04)', padding: '14px 16px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#7A5610', marginBottom: 10, fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
        Dev Testing — tap a role to log in instantly
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DEV_USERS.map(u => (
          <button
            key={u.role}
            onClick={() => loginAs(u)}
            type="button"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10,
              background: NAVY, color: '#fff', border: `1px solid ${GOLD}40`,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <span>{u.label}</span>
            <span style={{ fontSize: 10.5, opacity: 0.55 }}>{u.email}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Eye icon ──────────────────────────────────────────────────────────── */
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

/* ─── Main AuthScreen ───────────────────────────────────────────────────── */
interface AuthScreenProps {
  onSuccess?: () => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps = {}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('email');
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = useCallback(async () => {
    if (!PHONE_RE.test(phone)) { setPhoneErr('Enter a valid 10-digit mobile number'); return; }
    setPhoneErr(''); setLoading(true);
    try {
      await authApi.sendOtp(phone, getDeviceId());
      router.push(`/verify-otp?phone=${encodeURIComponent(phone)}`);
    } catch (err) {
      setPhoneErr(err instanceof ApiError ? err.message : 'Could not send OTP. Please try again.');
      setLoading(false);
    }
  }, [phone, router]);

  const handleEmailSubmit = useCallback(async () => {
    if (!EMAIL_RE.test(email)) { setEmailErr('Enter a valid email address'); return; }
    if (password.length < 6)  { setEmailErr('Password must be at least 6 characters'); return; }
    setEmailErr(''); setLoading(true);
    try {
      const res = isSignUp
        ? await authApi.register(email, password)
        : await authApi.emailLogin(email, password);
      saveTokens(res);
      if (onSuccess) { onSuccess(); } else { const permsDone = localStorage.getItem('rg_permissions_done'); router.replace(permsDone ? '/home' : '/permissions'); }
    } catch (err) {
      setEmailErr(err instanceof ApiError ? err.message : isSignUp ? 'Registration failed. Try again.' : 'Invalid email or password.');
      setLoading(false);
    }
  }, [email, password, isSignUp, router]);

  const switchTab = (t: Tab) => { setTab(t); setPhoneErr(''); setEmailErr(''); };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* ── Hero background ── */}
      <div style={{
        flex: '0 0 38%',
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_MID} 40%, #2C5282 70%, #1E4080 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'rgba(200,147,42,0.08)' }} />
        <div style={{ position:'absolute', bottom:-40, left:-40, width:140, height:140, borderRadius:'50%', background:'rgba(200,147,42,0.06)' }} />
        <div style={{ position:'absolute', top:'30%', left:'8%', width:6, height:6, borderRadius:'50%', background:GOLD, opacity:0.6 }} />
        <div style={{ position:'absolute', top:'20%', right:'15%', width:4, height:4, borderRadius:'50%', background:GOLD, opacity:0.4 }} />
        <div style={{ position:'absolute', bottom:'25%', right:'10%', width:5, height:5, borderRadius:'50%', background:'rgba(200,147,42,0.5)' }} />

        <RGLogo size={82} flat />

        <div style={{ textAlign:'center', zIndex:1 }}>
          <p style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 26, fontWeight: 700, color: '#fff',
            letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2,
          }}>ReligioGram</p>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', margin: '5px 0 0', letterSpacing: '0.04em' }}>
            Connecting you to sacred spaces
          </p>
        </div>
      </div>

      {/* ── Auth card ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: '#F6F7FA',
        borderRadius: '24px 24px 0 0',
        marginTop: -12,
        boxShadow: '0 -8px 40px rgba(15,36,82,0.18)',
      }}>
        <div style={{ padding: '28px 24px 36px', maxWidth: 420, margin: '0 auto' }}>

          {/* Heading */}
          <h1 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 26, fontWeight: 700, color: '#0F172A',
            margin: '0 0 6px', letterSpacing: '-0.02em',
          }}>
            {isSignUp ? 'Create account' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: 13.5, color: '#64748B', margin: '0 0 24px' }}>
            {isSignUp ? 'Join thousands connecting with sacred spaces.' : 'Sign in to continue your spiritual journey.'}
          </p>

          {/* Tab switcher — MVP: email + Google only, phone hidden */}
          <div style={{
            display: 'none', background: '#ECEEF4', borderRadius: 12, padding: 4, marginBottom: 24,
            border: '1px solid rgba(15,36,82,0.08)',
          }}>
            {(['phone', 'email'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: 1, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em',
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? NAVY : '#94A3B8',
                  boxShadow: tab === t ? '0 1px 6px rgba(15,36,82,0.10)' : 'none',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {t === 'phone' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                    Mobile OTP
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Email
                  </>
                )}
              </button>
            ))}
          </div>

          {/* ── Phone Tab ── */}
          {tab === 'phone' && (
            <>
              <label style={{ display:'block', fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#64748B', marginBottom:8 }}>
                Mobile Number
              </label>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <div style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'0 14px', height:52, borderRadius:12, flexShrink:0,
                  background:'#fff', border:'1.5px solid rgba(15,36,82,0.14)',
                  fontSize:14, fontWeight:700, color:NAVY,
                }}>
                  🇮🇳 +91
                </div>
                <input
                  type="tel" inputMode="numeric" maxLength={10}
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g,'').slice(0,10)); setPhoneErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                  style={{
                    flex:1, minWidth:0, height:52, padding:'0 16px', borderRadius:12,
                    border: `1.5px solid ${phoneErr ? '#EF4444' : 'rgba(15,36,82,0.14)'}`,
                    background:'#fff', fontSize:15, color:'#0F172A', outline:'none',
                    fontFamily:'"Plus Jakarta Sans", sans-serif',
                    transition:'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = NAVY_MID; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,36,82,0.10)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = phoneErr ? '#EF4444' : 'rgba(15,36,82,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              {phoneErr && <p style={{ fontSize:12, color:'#EF4444', marginBottom:8, display:'flex', alignItems:'center', gap:4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#EF4444"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/></svg>
                {phoneErr}
              </p>}
              <div style={{
                display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
                background:'rgba(200,147,42,0.07)', borderRadius:10, marginBottom:20,
                border:'1px solid rgba(200,147,42,0.2)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={GOLD}><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11v6h2v-6h-2zm0-4v2h2V7h-2z"/></svg>
                <span style={{ fontSize:12.5, color:'#7A5610', lineHeight:1.4 }}>A 6-digit OTP will be sent via SMS to verify your number.</span>
              </div>
              <button
                onClick={handleSendOtp}
                disabled={loading}
                className="rg-btn-primary"
                style={{ width:'100%' }}
              >
                {loading
                  ? <span style={{ width:20, height:20, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
                  : <><span>Send OTP</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>
                }
              </button>
            </>
          )}

          {/* ── Email Tab ── */}
          {tab === 'email' && (
            <>
              {/* Sign in / Sign up sub-tabs */}
              <div style={{ display:'flex', borderBottom:'1px solid rgba(15,36,82,0.10)', marginBottom:20, gap:20 }}>
                {([false, true] as const).map(signup => (
                  <button
                    key={String(signup)}
                    onClick={() => { setIsSignUp(signup); setEmailErr(''); }}
                    style={{
                      background:'none', border:'none', cursor:'pointer', paddingBottom:10,
                      fontSize:14.5, fontWeight:700, color: isSignUp === signup ? NAVY : '#94A3B8',
                      borderBottom: isSignUp === signup ? `2.5px solid ${NAVY}` : '2.5px solid transparent',
                      fontFamily:'"Plus Jakarta Sans", sans-serif',
                      transition:'all 0.15s', letterSpacing:'-0.01em',
                    }}
                  >
                    {signup ? 'Sign Up' : 'Sign In'}
                  </button>
                ))}
              </div>

              <label style={{ display:'block', fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#64748B', marginBottom:8 }}>Email Address</label>
              <input
                type="email" autoComplete="email" placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailErr(''); }}
                style={{
                  width:'100%', height:52, padding:'0 16px', borderRadius:12, boxSizing:'border-box',
                  border:`1.5px solid ${emailErr ? '#EF4444' : 'rgba(15,36,82,0.14)'}`,
                  background:'#fff', fontSize:15, color:'#0F172A', outline:'none', marginBottom:14,
                  fontFamily:'"Plus Jakarta Sans", sans-serif', transition:'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = NAVY_MID; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,36,82,0.10)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = emailErr ? '#EF4444' : 'rgba(15,36,82,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
              />

              <label style={{ display:'block', fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#64748B', marginBottom:8 }}>Password</label>
              <div style={{ position:'relative', marginBottom:!isSignUp ? 12 : 4 }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder={isSignUp ? 'Create a password (min. 6 chars)' : 'Enter your password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setEmailErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                  style={{
                    width:'100%', height:52, padding:'0 48px 0 16px', borderRadius:12, boxSizing:'border-box',
                    border:`1.5px solid ${emailErr ? '#EF4444' : 'rgba(15,36,82,0.14)'}`,
                    background:'#fff', fontSize:15, color:'#0F172A', outline:'none',
                    fontFamily:'"Plus Jakarta Sans", sans-serif', transition:'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = NAVY_MID; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15,36,82,0.10)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = emailErr ? '#EF4444' : 'rgba(15,36,82,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  onClick={() => setShowPw((v: any) => !v)} type="button"
                  style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:2 }}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>

              {!isSignUp && (
                <div style={{ textAlign:'right', marginBottom:16 }}>
                  <button type="button" style={{ background:'none', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600, color:NAVY_MID, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    Forgot password?
                  </button>
                </div>
              )}

              {emailErr && (
                <p style={{ fontSize:12, color:'#EF4444', marginBottom:12, display:'flex', alignItems:'center', gap:4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#EF4444"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/></svg>
                  {emailErr}
                </p>
              )}

              <button
                onClick={handleEmailSubmit}
                disabled={loading}
                className="rg-btn-primary"
                style={{ width:'100%', marginBottom:16 }}
              >
                {loading
                  ? <span style={{ width:20, height:20, border:'2.5px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
                  : <><span>{isSignUp ? 'Create Account' : 'Sign In'}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>
                }
              </button>
            </>
          )}

          {/* Terms */}
          <p style={{ textAlign:'center', fontSize:11.5, color:'#94A3B8', margin:'16px 0', lineHeight:1.5 }}>
            By continuing you agree to our{' '}
            <Link href="/terms" style={{ color:NAVY_MID, fontWeight:600, textDecoration:'underline' }}>Terms</Link>
            {' & '}
            <Link href="/privacy" style={{ color:NAVY_MID, fontWeight:600, textDecoration:'underline' }}>Privacy Policy</Link>
          </p>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, margin:'4px 0 16px' }}>
            <div style={{ flex:1, height:1, background:'rgba(15,36,82,0.08)' }} />
            <span style={{ fontSize:11, fontWeight:600, color:'#CBD5E1', letterSpacing:'0.06em' }}>OR</span>
            <div style={{ flex:1, height:1, background:'rgba(15,36,82,0.08)' }} />
          </div>

          {/* Google SSO */}
          <a
            href={authApi.googleUrl()}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              height:50, borderRadius:12, border:'1.5px solid rgba(15,36,82,0.12)',
              background:'#fff', textDecoration:'none', color:'#1A1A2E',
              fontSize:14, fontWeight:600, fontFamily:'"Plus Jakarta Sans", sans-serif',
              boxShadow:'0 1px 4px rgba(15,36,82,0.06)',
              transition:'all 0.15s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          {process.env.NODE_ENV !== 'production' && mounted && <DevPanel onSuccess={onSuccess} />}

        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
