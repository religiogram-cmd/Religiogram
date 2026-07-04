'use client';

/**
 * SkipVerificationButton — "Verify later" affordance on Steps 7/8/9.
 *
 * Verification (KYC video, PAN + selfie, payout account) is what unlocks a
 * provider's discoverability on the marketplace. Some applicants aren't
 * ready to complete those on the day they apply — they'd rather set up
 * their profile, save their progress, and come back with the paperwork on
 * hand.
 *
 * This component renders a small secondary link + a confirmation modal
 * that clearly states the consequences: hidden until verified, resume
 * from Profile → Become a Service Provider, discoverable only after
 * admin approval.
 *
 * On confirm we flush the current draft and route to
 * /provider-onboarding/awaiting-verification (a hold-page) — we do NOT
 * call /submit, because the backend requires KYC + docs + payout to
 * accept a submission.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';

interface Props {
  /** Which step the user is skipping from — controls the copy so the modal
   *  can be precise about what they're deferring. */
  from: 'kyc' | 'identity' | 'payout';
}

export default function SkipVerificationButton({ from }: Props) {
  const router = useRouter();
  const { flush } = useProviderOnboarding();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const label =
    from === 'kyc'      ? 'the video introduction'
  : from === 'identity' ? 'your ID documents'
  :                       'your payout details';

  const confirm = async () => {
    setBusy(true);
    try {
      await flush(); // persist whatever's been filled so far
    } finally {
      router.push('/provider-onboarding/awaiting-verification');
    }
  };

  return (
    <>
      <div className="text-center pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-[#0F2452]/70 hover:text-[#0F2452] underline underline-offset-4 decoration-[#0F2452]/30 hover:decoration-[#0F2452]/60"
        >
          Verify later
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#F7EFE1] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#0F2452]/10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 border-b border-[#0F2452]/10">
              <h2
                className="text-xl font-bold text-[#0F2452]"
                style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
              >
                Skip verification for now?
              </h2>
              <p className="text-sm text-gray-700/85 mt-1.5">
                You can come back to finish {label} later.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4">
                <p className="text-xs font-bold tracking-wide uppercase text-amber-800">
                  What happens without verification
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-amber-900/90 leading-relaxed">
                  <li className="flex gap-2">
                    <span aria-hidden>›</span>
                    <span>Users <b>cannot discover</b> your profile.</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>›</span>
                    <span>You&apos;ll stay in <b>draft</b> until you finish.</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>›</span>
                    <span>Bookings only open after our team approves you.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl bg-white/60 border border-[#0F2452]/15 p-4">
                <p className="text-xs font-bold tracking-wide uppercase text-[#0F2452]/70">
                  How to complete it later
                </p>
                <p className="mt-2 text-sm text-gray-700/85 leading-relaxed">
                  Open <b>Profile</b> tab → <b>Become a Service Provider</b> — you&apos;ll
                  resume exactly where you left off. Once you upload the last
                  piece and our team approves your profile, users can find and
                  book you.
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="w-full px-5 py-3 rounded-xl font-semibold text-[#F7EFE1] bg-[#0F2452] disabled:bg-[#0F2452]/40 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                {busy && (
                  <span
                    aria-hidden
                    className="inline-block w-4 h-4 rounded-full border-2 border-[#F7EFE1]/40 border-t-[#F7EFE1] animate-spin"
                  />
                )}
                <span>{busy ? 'Saving…' : 'Yes, verify later'}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="w-full px-5 py-3 rounded-xl font-semibold text-[#0F2452] bg-[#0F2452]/5 hover:bg-[#0F2452]/10 disabled:opacity-50"
              >
                No, I&apos;ll finish now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
