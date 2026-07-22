'use client';

/**
 * /provider-onboarding/submitted — post-submission success screen.
 *
 * Verifies with the backend that the caller's provider row is actually in
 * `pending_review` or beyond BEFORE clearing the local draft or showing the
 * success copy. Previously this page rendered unconditionally, so if a user
 * landed here by mistake (typing the URL, or a race where the submit call
 * failed but router.push had already fired) they'd see fake congratulations
 * AND lose their local draft to `reset()`. That produced two support
 * incidents where the applicant thought they were done but their record
 * was still `draft`.
 *
 * Behaviour:
 *   • Provider status = pending_review / approved  → clear draft + render
 *     success copy (correct case).
 *   • Provider status = draft                       → route back to
 *     /provider-onboarding so they can complete the missing pieces.
 *   • Provider status = rejected / suspended       → route to
 *     /provider-status which explains the state and next actions.
 *   • Network error                                 → render success anyway;
 *     the app was optimistic and the user did complete the flow. If it was
 *     a real error we'll surface it on the next visit.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

export default function SubmittedPage() {
  const router = useRouter();
  const { reset, data } = useProviderOnboarding();
  const [confirmed, setConfirmed] = useState<'checking' | 'ok'>('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const d = await providerOnboardingApi.getDraft();
        if (cancelled) return;
        const st = d.providerStatus;

        if (st === 'pending_review' || st === 'approved') {
          reset();
          setConfirmed('ok');
          return;
        }

        if (st === 'rejected' || st === 'suspended') {
          router.replace('/provider-status');
          return;
        }

        // Still draft — the submit didn't actually succeed even though the
        // client navigated here. Send the user back to finish + surface a
        // toast via query param so the entry page can show a warning.
        router.replace('/provider-onboarding?resubmit=pending');
      } catch {
        // Network flaky — show the success screen and don't wipe the draft
        // until confirmed. Better to show success optimistically than block
        // a legit user who's actually done.
        if (!cancelled) setConfirmed('ok');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (confirmed === 'checking') {
    return (
      <div className="min-h-svh bg-[#F7EFE1] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = (data.fullName ?? '').split(' ')[0] || 'there';

  return (
    <div className="min-h-svh bg-[#F7EFE1] text-[#0F2452] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto text-center">
        <div
          className="w-20 h-20 rounded-full bg-[#0F2452] text-[#F7EFE1] flex items-center justify-center text-4xl shadow-lg"
          aria-hidden
        >
          ✓
        </div>

        <h1 className="mt-6 text-3xl font-bold leading-tight">
          Thank you, {firstName}.
        </h1>
        <p className="mt-3 text-base text-gray-700/80 leading-relaxed">
          Your profile has been submitted for review. Our team will watch your
          introduction video, verify your details, and get back to you within{' '}
          <b>24–48 hours</b>.
        </p>

        <div className="mt-8 w-full rounded-2xl bg-white border border-[#0F2452]/15 p-5 text-left space-y-3">
          <p className="font-semibold text-gray-700">What happens next</p>
          <Step num="1" title="Review" desc="We verify your identity and video." />
          <Step
            num="2"
            title="Approval"
            desc="You'll get an SMS + email once approved."
          />
          <Step
            num="3"
            title="Your first booking"
            desc="Devotees will start seeing your services instantly."
          />
        </div>

        <button
          type="button"
          onClick={() => router.push('/home')}
          className="mt-8 px-6 py-3 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452] hover:bg-[#0F2452] active:scale-[0.98] transition"
        >
          Back to home
        </button>

        <p className="mt-6 text-xs text-gray-700/60">
          Questions? Write to us at{' '}
          <a href="mailto:guides@religiogram.com" className="underline">
            guides@religiogram.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-[#0F2452]/10 text-gray-700 text-sm font-semibold flex items-center justify-center">
        {num}
      </span>
      <div>
        <p className="font-medium text-gray-700">{title}</p>
        <p className="text-sm text-gray-700/70">{desc}</p>
      </div>
    </div>
  );
}
