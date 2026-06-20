'use client';

/**
 * /provider-onboarding — landing + resume.
 *
 * When a user hits this route we check the server-side draft. If they've
 * made it past Step 1 we jump them straight to their last step. Otherwise
 * we show a warm welcome + "Start" CTA so the first screen isn't a blank
 * form.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

export default function ProviderOnboardingEntry() {
  const router = useRouter();
  const { step, saveStatus } = useProviderOnboarding();
  const [checked, setChecked] = useState(false);

  // Block re-fill if the application is already submitted/decided.
  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi
      .getDraft()
      .then((d) => {
        if (cancelled) return;
        const st = d.providerStatus;
        if (st === 'pending_review' || st === 'approved' || st === 'rejected') {
          router.replace('/provider-status');
        }
      })
      .catch(() => {
        /* non-fatal — let the normal flow continue */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Wait for the context to hydrate from the server before deciding
    // whether to resume.
    if (saveStatus !== 'idle') {
      setChecked(true);
      return;
    }
    // Fallback: if hydration stalls (no local state, empty remote), proceed
    // anyway after 1.5s so we don't hang on a blank screen.
    const t = setTimeout(() => setChecked(true), 1500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  if (!checked) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#F7EFE1]">
        <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-[#F7EFE1] text-[#0F2452] flex flex-col">
      <main className="flex-1 flex flex-col px-6 py-10 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mt-8 leading-tight">
          Share your services with devotees, on your terms.
        </h1>
        <p className="mt-4 text-base text-gray-700/80 leading-relaxed">
          Join ReligioGram as a Spiritual Guide. Fill seven short steps —
          basic details, your faith, what you offer, pricing, availability,
          and a 30-second introduction video. You can save and resume any
          time.
        </p>

        <ul className="mt-6 space-y-2 text-sm text-gray-700/80">
          <li>• Open to all faiths — Hindu, Islam, Sikh, Christian, and more</li>
          <li>• Pick your services, set your own prices</li>
          <li>• We handle booking, payment, and reminders</li>
        </ul>

        <div className="flex-1" />

        <button
          onClick={() =>
            router.push(`/provider-onboarding/step-${Math.max(1, step)}`)
          }
          className="mt-10 px-5 py-4 rounded-xl font-semibold text-[#F7EFE1]
                     bg-[#0F2452] hover:bg-[#0F2452] active:scale-[0.98] transition"
        >
          {step > 1 ? `Resume — Step ${step} of 9` : 'Start onboarding'}
        </button>
        <p className="mt-3 text-xs text-gray-700/60 text-center">
          Takes about 10 minutes. Saves automatically.
        </p>
      </main>
    </div>
  );
}
