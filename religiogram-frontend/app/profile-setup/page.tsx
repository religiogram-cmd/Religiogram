'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /profile-setup — DISABLED for MVP.
 *
 * The first-run profile wizard was cut from the launch scope. This route
 * now exists only as a backstop: any code path that still navigates here
 * is silently bounced to /home.
 */
export default function ProfileSetupPage() {
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
