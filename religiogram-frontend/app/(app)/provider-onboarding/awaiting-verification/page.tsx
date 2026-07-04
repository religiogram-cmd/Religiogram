'use client';

/**
 * /provider-onboarding/awaiting-verification
 *
 * Landing page shown when an applicant taps "Verify later" on Step 7, 8, or
 * 9. Their draft is saved, but they haven't submitted — so their provider
 * row remains in `draft` status and is NOT discoverable. This page tells
 * them exactly what's still missing and gives one big button to resume.
 *
 * We compute the missing items from the store so the copy is honest —
 * "you still need PAN + selfie" or "you still need bank details".
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

export default function AwaitingVerificationPage() {
  const router = useRouter();
  const { data, step } = useProviderOnboarding();
  const [remoteState, setRemoteState] = useState<{
    kycUploaded: boolean;
    panUploaded: boolean;
    selfieUploaded: boolean;
    bankSet: boolean;
  } | null>(null);

  /* Reconcile with server so we don't mis-report status if the user has
   * already uploaded something in a previous session on another device. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await providerOnboardingApi.getDraft();
        // If they somehow already submitted, bounce to the status page.
        if (draft.providerStatus === 'pending_review' || draft.providerStatus === 'approved') {
          router.replace('/provider-status');
          return;
        }
        // The /me endpoint returns panUploaded/selfieUploaded/bankSet flags,
        // but the api client currently only exposes /draft. We fall back to
        // the client-side heuristic below.
      } catch {
        /* offline — carry on with local data */
      } finally {
        if (!cancelled) {
          setRemoteState({
            kycUploaded:    !!data.kycR2ObjectKey,
            panUploaded:    !!data.panR2ObjectKey,
            selfieUploaded: !!data.selfieR2ObjectKey,
            bankSet:        !!data.payoutMasked,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, data.kycR2ObjectKey, data.panR2ObjectKey, data.selfieR2ObjectKey, data.payoutMasked]);

  const category = (data.providerCategory as 'priest' | 'astrologer' | 'both' | undefined) ?? 'priest';
  const totalSteps = category === 'both' ? 12 : 9;

  const missing = useMemo(() => {
    if (!remoteState) return [];
    const items: { key: string; label: string }[] = [];
    if (!remoteState.kycUploaded)    items.push({ key: 'kyc',      label: '30-second introduction video' });
    if (!remoteState.panUploaded)    items.push({ key: 'pan',      label: 'PAN card photo' });
    if (!remoteState.selfieUploaded) items.push({ key: 'selfie',   label: 'Selfie photo' });
    if (!remoteState.bankSet)        items.push({ key: 'bank',     label: 'Payout method (bank or UPI)' });
    return items;
  }, [remoteState]);

  const resume = () => {
    // Route back into the appropriate sub-flow at the furthest step they
    // reached. The store's monotonic `step` is the source of truth here.
    router.push(`/provider-onboarding/${category}/step-${Math.max(1, Math.min(step, totalSteps))}`);
  };

  return (
    <div className="min-h-svh bg-[#F7EFE1] text-[#0F2452]">
      <main className="px-6 py-8 max-w-xl mx-auto">
        {/* Status pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300">
          <span aria-hidden className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
          <span className="text-xs font-bold tracking-wide uppercase text-amber-900">
            Not discoverable yet
          </span>
        </div>

        <h1
          className="mt-4 text-3xl font-bold leading-tight"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          Your profile is saved.<br />
          Just one step away.
        </h1>
        <p className="mt-3 text-sm text-gray-700/85 leading-relaxed">
          We&apos;ve safely stored everything you&apos;ve filled in. But until you
          complete verification and our team approves your profile, devotees
          won&apos;t see you in search results and can&apos;t book you.
        </p>

        {/* Missing checklist */}
        {missing.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white/60 border border-[#0F2452]/15 p-5">
            <p className="text-xs font-bold tracking-wide uppercase text-[#0F2452]/70">
              Still to do
            </p>
            <ul className="mt-3 space-y-2.5">
              {missing.map((m) => (
                <li key={m.key} className="flex gap-3 items-start">
                  <span
                    aria-hidden
                    className="mt-0.5 w-5 h-5 rounded-full border-2 border-[#0F2452]/40 flex-shrink-0"
                  />
                  <span className="text-sm text-[#0F2452] leading-relaxed">
                    {m.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What happens next */}
        <section className="mt-5 rounded-2xl bg-[#0F2452]/[0.04] border border-[#0F2452]/10 p-5">
          <p className="text-xs font-bold tracking-wide uppercase text-[#0F2452]/70">
            What happens next
          </p>
          <ol className="mt-3 space-y-3 text-sm text-gray-700/90 leading-relaxed">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0F2452] text-[#F7EFE1] font-bold text-xs flex items-center justify-center flex-shrink-0">1</span>
              <span>Come back anytime from <b>Profile</b> → <b>Become a Service Provider</b>.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0F2452] text-[#F7EFE1] font-bold text-xs flex items-center justify-center flex-shrink-0">2</span>
              <span>Finish the remaining items — the form remembers exactly where you left off.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0F2452] text-[#F7EFE1] font-bold text-xs flex items-center justify-center flex-shrink-0">3</span>
              <span>Our admin team reviews and approves within 2 business days.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-green-700 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">✓</span>
              <span>You go live — devotees can find you, message you, and book you.</span>
            </li>
          </ol>
        </section>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={resume}
            className="w-full px-5 py-3.5 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452] hover:bg-[#0F2452] active:scale-[0.98] transition"
          >
            Continue verification now
          </button>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="w-full px-5 py-3.5 rounded-xl font-semibold text-[#0F2452] bg-[#0F2452]/5 hover:bg-[#0F2452]/10 transition"
          >
            I&apos;ll finish later
          </button>
        </div>

        <p className="mt-5 text-[11px] text-gray-700/60 text-center">
          Your progress is saved automatically. No re-doing forms.
        </p>
      </main>
    </div>
  );
}
