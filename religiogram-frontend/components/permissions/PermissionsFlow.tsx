'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RGLogo } from '@/components/ui/RGLogo';
import { useGeolocation } from '@/hooks/useGeolocation';

const NAVY = '#0F2452';
const GOLD = '#C8932A';

/* ─── Inline SVG illustrations ─────────────────────────────────────────── */

function LocationIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" fill="#F0F4FF" />
      <circle cx="60" cy="60" r="44" fill="#E6EBF8" />
      {/* Pin body */}
      <path
        d="M60 28C48.954 28 40 36.954 40 48C40 62 60 88 60 88C60 88 80 62 80 48C80 36.954 71.046 28 60 28Z"
        fill={NAVY}
      />
      {/* Pin hole */}
      <circle cx="60" cy="48" r="9" fill="white" />
      <circle cx="60" cy="48" r="5" fill={GOLD} />
      {/* Subtle shadow ellipse */}
      <ellipse cx="60" cy="91" rx="12" ry="4" fill={NAVY} fillOpacity="0.12" />
    </svg>
  );
}

function NotificationIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="56" fill="#F0F4FF" />
      <circle cx="60" cy="60" r="44" fill="#E6EBF8" />
      {/* Bell body */}
      <path
        d="M60 28C60 28 44 36 44 54V72H76V54C76 36 60 28 60 28Z"
        fill={NAVY}
      />
      {/* Bell bottom curve */}
      <path
        d="M44 72H76L78 78H42L44 72Z"
        fill={NAVY}
      />
      {/* Bell clapper */}
      <ellipse cx="60" cy="81" rx="6" ry="4" fill={NAVY} />
      {/* Notification badge */}
      <circle cx="77" cy="40" r="10" fill={GOLD} />
      <text x="77" y="44.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">!</text>
    </svg>
  );
}

/* ─── Shared button styles ──────────────────────────────────────────────── */

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 52,
  borderRadius: 14,
  border: 'none',
  background: NAVY,
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  transition: 'opacity 0.15s',
};

const skipBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  cursor: 'pointer',
  marginTop: 8,
};

/* ─── Step 0: Location ──────────────────────────────────────────────────── */

function LocationStep({ onNext }: { onNext: () => void }) {
  const geo = useGeolocation();
  const [requesting, setRequesting] = useState(false);

  const handleAllow = useCallback(async () => {
    setRequesting(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      try {
        localStorage.setItem('rg_location', JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
      } catch {}
    } catch {
      /* denied or unavailable — that's fine, app still works */
    } finally {
      setRequesting(false);
      onNext();
    }
  }, [onNext]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <LocationIllustration />
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: NAVY,
          textAlign: 'center',
          marginBottom: 12,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          lineHeight: 1.25,
        }}
      >
        Allow Location Access
      </h1>
      <p
        style={{
          fontSize: 14,
          color: '#64748b',
          textAlign: 'center',
          maxWidth: 280,
          margin: '0 auto 32px',
          lineHeight: 1.6,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        We use your location to show you temples, pandits, and spiritual services near you.
      </p>
      <button
        type="button"
        onClick={handleAllow}
        disabled={requesting}
        style={{ ...primaryBtnStyle, opacity: requesting ? 0.65 : 1 }}
      >
        {requesting ? (
          <>
            <span
              style={{
                width: 18, height: 18,
                border: '2px solid rgba(255,255,255,0.35)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'rg-spin 0.8s linear infinite',
              }}
            />
            Requesting…
          </>
        ) : (
          'Allow Location'
        )}
      </button>
      <button type="button" onClick={onNext} style={skipBtnStyle}>
        Skip for now
      </button>
    </>
  );
}

/* ─── Step 1: Notifications ─────────────────────────────────────────────── */

function NotificationStep({ onDone }: { onDone: () => void }) {
  const [requesting, setRequesting] = useState(false);

  const finish = useCallback(() => {
    try { localStorage.setItem('rg_permissions_done', '1'); } catch {}
    onDone();
  }, [onDone]);

  const handleAllow = useCallback(async () => {
    setRequesting(true);
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const result = await Notification.requestPermission();
        try { localStorage.setItem('rg_notif_permission', result); } catch {}
      }
    } catch {
      /* unavailable */
    } finally {
      setRequesting(false);
      finish();
    }
  }, [finish]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <NotificationIllustration />
      </div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: NAVY,
          textAlign: 'center',
          marginBottom: 12,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          lineHeight: 1.25,
        }}
      >
        Stay Updated
      </h1>
      <p
        style={{
          fontSize: 14,
          color: '#64748b',
          textAlign: 'center',
          maxWidth: 280,
          margin: '0 auto 32px',
          lineHeight: 1.6,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        Get notified about booking confirmations, new messages, and spiritual reminders.
      </p>
      <button
        type="button"
        onClick={handleAllow}
        disabled={requesting}
        style={{ ...primaryBtnStyle, opacity: requesting ? 0.65 : 1 }}
      >
        {requesting ? (
          <>
            <span
              style={{
                width: 18, height: 18,
                border: '2px solid rgba(255,255,255,0.35)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'rg-spin 0.8s linear infinite',
              }}
            />
            Requesting…
          </>
        ) : (
          'Allow Notifications'
        )}
      </button>
      <button type="button" onClick={finish} style={skipBtnStyle}>
        Maybe later
      </button>
    </>
  );
}

/* ─── Main PermissionsFlow ──────────────────────────────────────────────── */

export default function PermissionsFlow() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);

  const goToStep1 = useCallback(() => setStep(1), []);
  const goHome = useCallback(() => router.replace('/home'), [router]);

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '48px 24px 40px',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 40 }}>
        <RGLogo size={40} />
      </div>

      {/* Step progress dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              height: 6,
              width: i === step ? 28 : 10,
              borderRadius: 3,
              background: i === step ? NAVY : '#e2e8f0',
              transition: 'width 0.3s',
              display: 'inline-block',
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#ffffff',
          borderRadius: 24,
          padding: '32px 28px 28px',
          boxShadow: '0 4px 32px rgba(15,36,82,0.08)',
          border: '1px solid #f1f5f9',
        }}
      >
        {step === 0 ? (
          <LocationStep onNext={goToStep1} />
        ) : (
          <NotificationStep onDone={goHome} />
        )}
      </div>

      <style>{`@keyframes rg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
