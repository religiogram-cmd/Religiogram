'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileSetupWizard from '@/components/profile/ProfileSetupWizard';
import { tokenStore, authApi } from '@/lib/api';

/**
 * /profile-setup — first-run wizard route.
 *
 * Lives outside the (app) layout group on purpose: we don't want the
 * BottomNav bar competing for attention during onboarding. The route
 * still needs the same auth bootstrap as the authed shell, so we
 * duplicate the minimal session-check here.
 *
 * Bootstrap:
 *   1. If there's an access token in memory → render.
 *   2. If there's a refresh token (cold start) → try /auth/refresh.
 *   3. Otherwise → bounce to /.
 */
export default function ProfileSetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authed' | 'redirect'>('checking');

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (tokenStore.access) {
        if (!cancelled) setStatus('authed');
        return;
      }
      if (tokenStore.refresh) {
        try {
          await authApi.refresh();
          if (tokenStore.access) {
            if (!cancelled) setStatus('authed');
            return;
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) {
        setStatus('redirect');
        router.replace('/');
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status !== 'authed') {
    return (
      <div
        className="min-h-svh flex items-center justify-center"
        style={{ background: '#F6F7FA' }}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  return <ProfileSetupWizard />;
}
