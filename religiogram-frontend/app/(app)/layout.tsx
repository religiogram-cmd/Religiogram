'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { tokenStore, tryRefresh, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { CityProvider } from '@/contexts/CityContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { RGLogo } from '@/components/ui/RGLogo';

// Dynamic imports — isolate heavy/optional components from the layout bundle
const BottomNav = dynamic(() => import('@/components/ui/BottomNav'), { ssr: false });
const RGAIBubble = dynamic(() => import('@/components/ai/RGAIBubble'), { ssr: false });
const ToastHost = dynamic(() => import('@/components/ui/Toast'), { ssr: false });

// Bump on every edit — lets you confirm in DevTools console which bundle is live.
const LAYOUT_BUILD_TAG = '2026-05-29-applayout-fix-1';

/**
 * Race any promise against a wall-clock cap. Used to make sure neither
 * tryRefresh nor /users/me can leave the layout in a permanent spinner state.
 */
function withCap<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

/**
 * Protected app layout. Every route under /(app)/ is gated behind this guard.
 * Auth bootstrap:
 *   1. Check in-memory access token.
 *   2. If missing, try refresh (3s cap).
 *   3. If refresh fails, redirect to /.
 *   4. Hydrate the user store via /users/me (2s cap, non-fatal).
 */
function AppContent({ children }: { children: React.ReactNode }) {
  usePushNotifications();
  const pathname = usePathname();
  // RG AI floating assistant — visible ONLY on the home screen.
  // Any (app) route added later that should also show the bubble can be
  // added to this allowlist (e.g. '/home' || '/explore').
  const showAiBubble = pathname === '/home';

  return (
    <div className="relative min-h-svh" style={{ background: '#FDF6E3' }}>
      <main className="pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <BottomNav />
      {showAiBubble && <RGAIBubble />}
      <ToastHost />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authed' | 'redirect'>('checking');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[AppLayout] mount — build:', LAYOUT_BUILD_TAG);

    let cancelled = false;

    const bootstrap = async () => {
      let hasToken = !!tokenStore.access;

      if (!hasToken) {
        // Cap the refresh at 3s. If the mock backend is unreachable / hung,
        // we fall through to the redirect immediately instead of forever-spinner.
        const ok = await withCap(tryRefresh(), 3000, false);
        if (cancelled) return;
        if (!ok) {
          tokenStore.clear();
          setStatus('redirect');
          router.replace('/');
          return;
        }
        hasToken = true;
      }

      // Hydrate user store from /users/me. 2s cap, non-fatal.
      // A missing route or slow mock cannot block the UI rendering.
      if (tokenStore.access) {
        const me = await withCap(
          apiFetch<{
            id: string; phone?: string; email?: string; name?: string;
            fullName?: string; avatarUrl?: string;
            role: 'user' | 'provider' | 'admin' | 'seeker' | 'advisor';
            isProfileComplete?: boolean; isVerified?: boolean;
          }>('/users/me', { auth: true }).catch(() => null),
          2000,
          null,
        );
        if (cancelled) return;
        if (me) useAuthStore.getState().setAuth(me, tokenStore.access!);
      }

      if (!cancelled) setStatus('authed');
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [router]);

  if (status !== 'authed') {
    return (
      <div
        className="min-h-svh flex flex-col items-center justify-center gap-5"
        style={{ background: 'linear-gradient(180deg,#F6F7FA 0%,#EEF0F7 100%)' }}
        aria-busy="true"
        aria-live="polite"
      >
        <RGLogo size={72} />
        <span
          className="animate-spin"
          role="status"
          aria-label="Loading"
          style={{
            width: 28,
            height: 28,
            border: '2.5px solid rgba(15,36,82,0.15)',
            borderTopColor: '#0F2452',
            borderRadius: '50%',
          }}
        />
      </div>
    );
  }

  return (
    <CityProvider>
      <AppContent>{children}</AppContent>
    </CityProvider>
  );
}
