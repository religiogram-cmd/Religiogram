'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /become-priest redirects to the full provider onboarding wizard.
 * Old links (emails, social) still land correctly.
 */
export default function BecomePriestRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/provider-onboarding');
  }, [router]);

  return (
    <div
      className="min-h-svh flex items-center justify-center"
      style={{ background: '#F6F7FA' }}
      aria-busy="true"
    >
      <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
    </div>
  );
}
