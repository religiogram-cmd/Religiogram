'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore, tryRefresh } from '@/lib/api';
import AuthScreen from '@/components/auth/AuthScreen';
import MobileAppFrame from '@/components/ui/MobileAppFrame';

// Bump this string whenever you edit this file. Watching it change in the
// browser DevTools console is the easiest way to confirm the new bundle is
// actually running (and not a stale service-worker cache copy).
const PAGE_BUILD_TAG = '2026-06-26-auth-route';

/**
 * /auth — sign-in / sign-up screen.
 *
 * Previously lived at /. Moved here when we added a public marketing
 * landing page at /. AuthScreen renders synchronously on first paint;
 * a silent refresh runs in a fire-and-forget useEffect capped at 2s and
 * redirects to /home on success.
 */
export default function AuthPage() {
  const router = useRouter();

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
    <MobileAppFrame>
      <AuthScreen />
    </MobileAppFrame>
  );
}
