'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore, tryRefresh } from '@/lib/api';
import AuthScreen from '@/components/auth/AuthScreen';

// Bump this string whenever you edit this file. Watching it change in the
// browser DevTools console is the easiest way to confirm the new bundle is
// actually running (and not a stale service-worker cache copy).
const PAGE_BUILD_TAG = '2026-07-01-auth-split-screen';

/**
 * /auth — sign-in / sign-up screen.
 *
 * Layout:
 *   - Mobile (<900px): single-column, AuthScreen fills the viewport (same
 *     as it always has — no visual change for the Play Store PWA or phone
 *     users).
 *   - Desktop (≥900px): split-screen — cinematic hero image on the left
 *     half, the AuthScreen form centred in a white card on the right half.
 *     Matches the modern "hero + form" pattern used by most SaaS auth pages.
 *
 * AuthScreen renders synchronously on first paint; a silent refresh runs
 * in a fire-and-forget useEffect capped at 2s and redirects to /home on
 * success.
 */
export default function AuthPage() {
  const router = useRouter();
  // Track viewport so we render AuthScreen with `embedded=true` only on
  // desktop where our split-screen wrapper already supplies a hero image.
  // On mobile we want AuthScreen's own native-app-style shell (fixed
  // position, built-in navy hero) — matches what Play Store users see.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[AuthPage] mount — build:', PAGE_BUILD_TAG);

    if (tokenStore.access) {
      const permsDone =
        typeof window !== 'undefined' &&
        localStorage.getItem('rg_permissions_done');
      router.replace(permsDone ? '/home' : '/permissions');
      return;
    }

    let cancelled = false;
    const cap = new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), 2000),
    );
    Promise.race([tryRefresh().catch(() => false), cap]).then((ok) => {
      if (cancelled || !ok) return;
      const permsDone =
        typeof window !== 'undefined' &&
        localStorage.getItem('rg_permissions_done');
      router.replace(permsDone ? '/home' : '/permissions');
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <style>{`
        /* ────── MOBILE (default) — AuthScreen fills viewport ────── */
        .rg-auth-shell {
          min-height: 100svh;
          display: flex;
          background: #FDF6E3;
        }
        .rg-auth-hero { display: none; }
        .rg-auth-form-wrap {
          flex: 1;
          min-height: 100svh;
          display: flex;
          flex-direction: column;
        }
        .rg-auth-form-inner {
          width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ────── DESKTOP (≥900px) — split screen: hero LEFT, form RIGHT ────── */
        @media (min-width: 900px) {
          .rg-auth-hero {
            display: block;
            flex: 1 1 50%;
            background-image:
              linear-gradient(180deg, rgba(10,22,40,0.10) 0%, rgba(10,22,40,0.05) 100%),
              url('/auth-hero.jpg');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            min-height: 100svh;
          }
          .rg-auth-form-wrap {
            flex: 1 1 50%;
            align-items: center;
            justify-content: center;
            padding: 48px 40px;
            background: #FDF6E3;
          }
          .rg-auth-form-inner {
            max-width: 480px;
            width: 100%;
            flex: initial;
            background: #FFFFFF;
            border-radius: 20px;
            box-shadow:
              0 24px 60px -22px rgba(15,36,82,0.18),
              0 0 0 1px rgba(200,146,10,0.10);
            overflow: hidden;
          }
        }
      `}</style>

      <div className="rg-auth-shell">
        <div className="rg-auth-hero" aria-hidden="true" />
        <div className="rg-auth-form-wrap">
          <div className="rg-auth-form-inner">
            <AuthScreen embedded={isDesktop} />
          </div>
        </div>
      </div>
    </>
  );
}
