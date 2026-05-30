'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy onboarding route — kept as a safe redirect.
 *
 * Flow change (Apr 2026): we removed the role-select step from sign-up.
 * Every new user is created as 'seeker' by default and lands directly on
 * /home after OTP verification. Users who want to offer services can opt
 * in from Profile → Become a Priest.
 *
 * Any client that still has a bookmark or old deeplink to /onboarding
 * (e.g. a stale push notification) should not see an empty screen — we
 * bounce them to /home, which itself is auth-guarded by (app)/layout.tsx.
 */
export default function OnboardingRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/home');
  }, [router]);

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
