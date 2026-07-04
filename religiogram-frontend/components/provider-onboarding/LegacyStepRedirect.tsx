'use client';

/**
 * Legacy step redirect.
 *
 * The old wizard lived at /provider-onboarding/step-N (a single tree). We
 * split it into three sub-flows rooted at /provider-onboarding/{priest,
 * astrologer,both}/step-N. Every old route now redirects to the new one
 * based on the draft's `providerCategory`. If the draft has no category
 * yet (e.g. very old link, or user hit /step-3 by hand), we send them to
 * the landing chooser instead of guessing.
 *
 * We wait a tick for the store to hydrate from localStorage / server, then
 * do a router.replace so the old URL doesn't appear in history.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';

export default function LegacyStepRedirect({ step }: { step: number }) {
  const router = useRouter();
  const { data, saveStatus } = useProviderOnboarding();

  useEffect(() => {
    // Wait until the store has settled (either synced with server or fallen
    // back to local). Trying to redirect before hydration would send every
    // user to the landing page even when they have a category.
    if (saveStatus === 'idle') return;

    const cat = data.providerCategory;
    if (cat === 'astrologer' || cat === 'priest' || cat === 'both') {
      router.replace(`/provider-onboarding/${cat}/step-${step}`);
    } else {
      router.replace('/provider-onboarding');
    }
  }, [data.providerCategory, saveStatus, step, router]);

  return (
    <div className="min-h-svh flex items-center justify-center bg-[#F7EFE1]">
      <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
    </div>
  );
}
