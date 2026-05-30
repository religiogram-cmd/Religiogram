'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGeolocation } from '@/hooks/useGeolocation';

/**
 * Permissions screen — runs once after the profile-setup wizard and before
 * the first Home render.
 *
 * Flow:
 *   Step 0 (Location)       → we request geolocation. Grant → advance.
 *                             Deny → keep going; Home falls back to "pick a
 *                             city" mode so the product still works.
 *   Step 1 (Notifications)  → we request Notification permission so we can
 *                             later send booking confirmations. Grant OR
 *                             deny → advance to /home.
 *
 * Both prompts are triggered from a direct user-gesture click because iOS
 * Safari requires that for geolocation, and Chrome's permission-prompt
 * heuristics down-rank non-gesture requests as "probable spam". Skipping
 * either step records the deny locally so we don't re-ask this session,
 * but the browser-level permission state is the source of truth for
 * subsequent sessions.
 *
 * A localStorage flag `rg_permissions_seen` prevents the screen from
 * re-appearing on every cold start once the user has stepped through it.
 * Home checks this flag; the permissions page itself is directly
 * navigable from the profile-setup finalize redirect.
 */

type NotifStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

const PERMISSIONS_DONE_KEY = 'rg_permissions_seen';

export default function PermissionsScreen() {
  const router = useRouter();
  const geo = useGeolocation();
  const [stepIdx, setStepIdx] = useState<0 | 1>(0);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('idle');

  /* ── Initialise notif status from what the browser already knows. ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setNotifStatus('unavailable');
      return;
    }
    if (Notification.permission === 'granted') setNotifStatus('granted');
    else if (Notification.permission === 'denied') setNotifStatus('denied');
    else setNotifStatus('idle');
  }, []);

  /* ── If the user already granted location in a prior session, skip ahead. ── */
  useEffect(() => {
    if (stepIdx === 0 && geo.status === 'granted') {
      setStepIdx(1);
    }
  }, [geo.status, stepIdx]);

  const markDoneAndGoHome = useCallback(() => {
    try {
      window.localStorage.setItem(PERMISSIONS_DONE_KEY, String(Date.now()));
    } catch {
      /* private mode — acceptable */
    }
    router.replace('/home');
  }, [router]);

  /* ── Step 0: location ── */
  const handleAllowLocation = useCallback(async () => {
    await geo.request();
    // Whether grant or deny, move the user forward. The temple screen will
    // gracefully handle the "no location" case by showing a city picker.
    setStepIdx(1);
  }, [geo]);

  const handleSkipLocation = useCallback(() => {
    setStepIdx(1);
  }, []);

  /* ── Step 1: notifications ── */
  const handleAllowNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifStatus('unavailable');
      markDoneAndGoHome();
      return;
    }
    setNotifStatus('requesting');
    try {
      const result = await Notification.requestPermission();
      setNotifStatus(result === 'granted' ? 'granted' : 'denied');
    } catch {
      setNotifStatus('denied');
    } finally {
      markDoneAndGoHome();
    }
  }, [markDoneAndGoHome]);

  const handleSkipNotifications = useCallback(() => {
    markDoneAndGoHome();
  }, [markDoneAndGoHome]);

  /* ── Views ── */
  const step = stepIdx === 0 ? (
    <LocationPrompt
      requesting={geo.status === 'requesting'}
      denied={geo.status === 'denied'}
      error={geo.error}
      onAllow={handleAllowLocation}
      onSkip={handleSkipLocation}
    />
  ) : (
    <NotificationPrompt
      requesting={notifStatus === 'requesting'}
      denied={notifStatus === 'denied'}
      unavailable={notifStatus === 'unavailable'}
      onAllow={handleAllowNotifications}
      onSkip={handleSkipNotifications}
    />
  );

  return (
    <main
      className="min-h-svh flex items-center justify-center px-4 py-6"
      style={{
        background:
          '#F6F7FA',
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl px-8 py-10 relative z-10"
        style={{
          background: 'rgba(255, 252, 245, 0.92)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(197, 138, 75, 0.2)',
          boxShadow:
            'inset 0 2px 0 rgba(255,255,255,.9), 0 20px 60px rgba(107,63,29,.14)',
        }}
      >
        {/* Progress pips */}
        <div className="flex items-center justify-center gap-2 mb-6" aria-label="Step progress">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === stepIdx ? 28 : 10,
                background:
                  i === stepIdx
                    ? 'linear-gradient(90deg,#C8932A,#C8932A 60%,#0F2452)'
                    : 'rgba(169,113,66,.22)',
              }}
            />
          ))}
        </div>

        {step}
      </div>
    </main>
  );
}

/* ─── Step 0: Location ─────────────────────────────────────────── */
function LocationPrompt({
  requesting,
  denied,
  error,
  onAllow,
  onSkip,
}: {
  requesting: boolean;
  denied: boolean;
  error: string | null;
  onAllow: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="flex justify-center mb-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(145deg, #C8932A 0%, #C8932A 55%, #0F2452 100%)',
            boxShadow: '0 8px 22px rgba(169,113,66,.42), inset 0 1.5px 0 rgba(255,255,255,.25)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
      </div>

      <h1
        style={{ fontFamily: 'Playfair Display, serif' }}
        className="text-[22px] font-bold text-[#0F2452] text-center leading-tight tracking-tight mb-3"
      >
        Find temples{' '}
        <span
          style={{
            background: 'linear-gradient(130deg, #C8932A, #C8932A 60%, #0F2452)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          near you
        </span>
      </h1>
      <p className="text-[13px] font-light text-gray-500 text-center leading-relaxed mb-6">
        Allow location access so we can show you verified temples nearby,
        accurate distances, and opening hours.
      </p>

      {denied && (
        <p className="text-[12px] text-red-500 text-center mb-4" role="alert">
          {error ?? 'Location access was denied. You can enable it in your browser settings at any time.'}
        </p>
      )}

      <button
        type="button"
        onClick={onAllow}
        disabled={requesting}
        className="w-full h-[52px] rounded-2xl font-semibold text-[15px] text-[#ffffff] flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{
          background: 'linear-gradient(140deg, #C8932A 0%, #C8932A 50%, #9A7B1E 100%)',
          boxShadow: requesting ? 'none' : '0 6px 22px rgba(169,113,66,.42)',
        }}
      >
        {requesting ? (
          <>
            <span className="w-5 h-5 border-2 border-white/35 border-t-white rounded-full animate-spin" />
            Requesting…
          </>
        ) : (
          'Allow location'
        )}
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full mt-3 text-[12.5px] font-medium text-gray-700/60 hover:text-[#0F2452] transition-colors py-2"
      >
        Not now
      </button>

      <p className="text-center text-[11px] text-gray-700/45 mt-4 leading-relaxed">
        You can still search any city manually.
      </p>
    </>
  );
}

/* ─── Step 1: Notifications ────────────────────────────────────── */
function NotificationPrompt({
  requesting,
  denied,
  unavailable,
  onAllow,
  onSkip,
}: {
  requesting: boolean;
  denied: boolean;
  unavailable: boolean;
  onAllow: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="flex justify-center mb-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(145deg, #C8932A 0%, #C8932A 55%, #0F2452 100%)',
            boxShadow: '0 8px 22px rgba(169,113,66,.42), inset 0 1.5px 0 rgba(255,255,255,.25)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
      </div>

      <h1
        style={{ fontFamily: 'Playfair Display, serif' }}
        className="text-[22px] font-bold text-[#0F2452] text-center leading-tight tracking-tight mb-3"
      >
        Stay in the loop
      </h1>
      <p className="text-[13px] font-light text-gray-500 text-center leading-relaxed mb-6">
        Get reminders for booked pujas, darshan timings, and important
        temple updates. You can turn these off anytime from Settings.
      </p>

      {denied && (
        <p className="text-[12px] text-[#0F2452]/80 text-center mb-4" role="status">
          You can enable notifications later from your browser site settings.
        </p>
      )}
      {unavailable && (
        <p className="text-[12px] text-[#0F2452]/80 text-center mb-4" role="status">
          This browser does not support notifications.
        </p>
      )}

      <button
        type="button"
        onClick={onAllow}
        disabled={requesting || unavailable}
        className="w-full h-[52px] rounded-2xl font-semibold text-[15px] text-[#ffffff] flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{
          background: 'linear-gradient(140deg, #C8932A 0%, #C8932A 50%, #9A7B1E 100%)',
          boxShadow: requesting || unavailable ? 'none' : '0 6px 22px rgba(169,113,66,.42)',
        }}
      >
        {requesting ? (
          <>
            <span className="w-5 h-5 border-2 border-white/35 border-t-white rounded-full animate-spin" />
            Requesting…
          </>
        ) : (
          'Enable notifications'
        )}
      </button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full mt-3 text-[12.5px] font-medium text-gray-700/60 hover:text-[#0F2452] transition-colors py-2"
      >
        Not now
      </button>
    </>
  );
}
