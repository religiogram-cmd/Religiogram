'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, tokenStore, ApiError } from '@/lib/api';

function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('rg_device_id') ?? '';
}

function formatPhone(phone: string): string {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function VerifyOtpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get('phone') ?? '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  /* ── Redirect if no phone ── */
  useEffect(() => {
    if (!phone) router.replace('/');
  }, [phone, router]);

  /* ── Resend cooldown timer ── */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c: any) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  /* ── Auto-focus first box on mount ── */
  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  /* ── Handle digit input ── */
  const handleDigit = useCallback((idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev: any) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (error) setError(null);
  }, [error]);

  const handleKeyDown = useCallback((idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? '';
    setDigits(next);
    const lastIdx = Math.min(pasted.length, 5);
    inputsRef.current[lastIdx]?.focus();
  }, [digits]);

  /* ── Verify ──
   *
   * Flow (current build):
   *   - New users (isNewUser === true) → /profile-setup for the multi-step
   *     profile capture, then /home once complete (or on skip).
   *   - Returning users → /home directly. If their profile is incomplete,
   *     the dashboard surfaces a resume-setup card; we don't force them
   *     back through the wizard mid-session.
   *
   * Role selection is intentionally skipped — this release ships a single
   * standard-user experience. Provider/priest features will return behind
   * a separate surface later.
   */
  const verifyCode = useCallback(async (code: string) => {
    if (verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await authApi.verifyOtp(phone, code, getDeviceId());
      tokenStore.set(res.tokens.accessToken, res.tokens.refreshToken);
      // Use replace (not push) so Back doesn't ricochet between OTP and home.
      // MVP: send everyone straight to /home, skip the profile-setup wizard.
      router.replace('/home');
    } catch (err) {
      setVerifying(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    }
  }, [phone, router, verifying]);

  /* ── Auto-verify when all 6 filled ── */
  useEffect(() => {
    if (digits.every((d: any) => d) && !verifying) {
      verifyCode(digits.join(''));
    }
  }, [digits, verifying, verifyCode]);

  /* ── Resend OTP ── */
  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await authApi.sendOtp(phone, getDeviceId());
      setCooldown(30);
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.retryAfter) setCooldown(err.retryAfter);
      }
    } finally {
      setResending(false);
    }
  }, [phone, cooldown, resending]);

  const allFilled = digits.every((d: any) => d);

  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-6"
      style={{ background: '#F6F7FA' }}>
      <div className="w-full max-w-sm rounded-3xl px-8 py-9 relative z-10"
        style={{
          background: 'rgba(255, 252, 245, 0.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(197, 138, 75, 0.18)',
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,.9), 0 20px 60px rgba(107,63,29,.14)',
        }}>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 hover:bg-blue-900/10 transition-colors"
          aria-label="Go back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2.4" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(145deg, #C8932A 0%, #C8932A 55%, #0F2452 100%)',
              boxShadow: '0 6px 20px rgba(169,113,66,.4), inset 0 1.5px 0 rgba(255,255,255,.25)',
            }}>
            <span style={{ fontFamily: 'Cinzel, serif' }} className="text-[#ffffff] text-lg font-bold tracking-widest">RG</span>
          </div>
        </div>

        <h1 style={{ fontFamily: 'Playfair Display, serif' }}
          className="text-[22px] font-bold text-[#0F2452] text-center leading-tight tracking-tight mb-2">
          Enter the <span style={{
            background: 'linear-gradient(130deg, #C8932A, #C8932A 60%, #0F2452)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>6-digit code</span>
        </h1>
        <p className="text-[13px] font-light text-[#374151] text-center mb-1">
          Code sent to
        </p>
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-[14px] font-semibold text-[#0F2452]">{formatPhone(phone)}</span>
          <button onClick={() => router.back()} className="text-[#0F2452] hover:opacity-70" aria-label="Change number">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        {/* 6-digit OTP boxes */}
        <div className="flex gap-2 justify-center mb-4">
          {digits.map((d: any, i: any) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={verifying}
              className={`w-12 h-14 rounded-2xl border-[1.5px] text-center text-[22px] font-bold text-[#0F2452] bg-white/70 outline-none focus:bg-white focus:ring-4 focus:ring-[#0F2452]/15 transition-all
                ${error ? 'border-red-400' : d ? 'border-[#0F2452]' : 'border-[#0F2452]/25'}
                ${verifying ? 'opacity-60' : ''}`}
              style={{ fontFamily: 'Playfair Display, serif' }}
              aria-label={`OTP digit ${i + 1}`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-[12px] text-red-500 text-center mb-3" role="alert">{error}</p>
        )}

        {/* Verifying state */}
        {verifying && (
          <div className="flex items-center justify-center gap-2 mb-4 text-[13px] text-[#0F2452]">
            <span className="w-4 h-4 border-2 border-[#0F2452]/30 border-t-amber-700 rounded-full animate-spin" />
            Verifying…
          </div>
        )}

        {/* Resend */}
        <div className="text-center text-[13px] text-[#374151] mb-4">
          Didn&apos;t receive it?{' '}
          {cooldown > 0 ? (
            <span className="text-gray-400">Resend in {cooldown}s</span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-[#0F2452] font-semibold hover:opacity-70 disabled:opacity-40">
              {resending ? 'Sending…' : 'Resend OTP'}
            </button>
          )}
        </div>

        {/* Manual verify button (fallback if auto-verify doesn't trigger) */}
        <button
          type="button"
          disabled={!allFilled || verifying}
          onClick={() => verifyCode(digits.join(''))}
          className="w-full h-[52px] rounded-2xl font-semibold text-[16px] text-[#ffffff] flex items-center justify-center gap-2 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(140deg, #C8932A 0%, #C8932A 50%, #9A7B1E 100%)',
            boxShadow: allFilled && !verifying ? '0 4px 18px rgba(169,113,66,.42)' : 'none',
          }}>
          Verify &amp; Continue
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </main>
  );
}

export default function VerifyOtpScreen() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100svh', background: '#FFFBF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid rgba(200,146,10,0.2)', borderTopColor: '#C8920A', borderRadius: '50%' }} />
      </div>
    }>
      <VerifyOtpInner />
    </Suspense>
  );
}
