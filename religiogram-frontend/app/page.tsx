'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore, tryRefresh } from '@/lib/api';
import AuthScreen from '@/components/auth/AuthScreen';

// Bump this string whenever you edit this file. Watching it change in the
// browser DevTools console is the easiest way to confirm the new bundle is
// actually running (and not a stale service-worker cache copy).
const PAGE_BUILD_TAG = '2026-05-29-bootstrap-fix-3';

/**
 * RootPage — no dynamic import, no spinner state, no deadlock possible.
 * AuthScreen renders synchronously on first paint. Silent refresh runs in a
 * fire-and-forget useEffect capped at 2s; on success we redirect to /home.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[RootPage] mount — build:', PAGE_BUILD_TAG);

    if (tokenStore.access) {
      const permsDone = typeof window !== 'undefined' && localStorage.getItem('rg_permissions_done');
      router.replace(permsDone ? '/home' : '/permissions');
      return;
    }

    let cancelled = false;
    const cap = new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000));
    Promise.race([tryRefresh().catch(() => false), cap]).then((ok) => {
      if (cancelled || !ok) return;
      const permsDone = typeof window !== 'undefined' && localStorage.getItem('rg_permissions_done');
      router.replace(permsDone ? '/home' : '/permissions');
    });

    return () => { cancelled = true; };
  }, [router]);

  return <AuthScreen />;
}
