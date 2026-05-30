'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';

/**
 * WizardShell — layout frame shared by every onboarding step.
 *
 * Responsibilities:
 *   - Show a persistent progress bar (Step X of 7)
 *   - Render a sticky footer with Back / Save & Next buttons
 *   - Surface sync status ("Saving…" / "Saved" / "Offline — will retry")
 *   - Block forward navigation with a per-step `canContinue` gate
 *
 * The step component owns validation; it calls `onContinue()` (which calls
 * the step's POST endpoint) and only returns without throwing when the
 * data is valid. The shell then advances.
 *
 * Design target: a first-time service provider — likely older, possibly
 * less tech-confident, on a modest phone. Large tap targets, plain text,
 * no jargon.
 */

export const STEP_LABELS: Record<number, string> = {
  1: 'Basic details',
  2: 'About your work',
  3: 'Your faith',
  4: 'Services',
  5: 'Pricing',
  6: 'Availability',
  7: 'Verify yourself',
};

interface WizardShellProps {
  currentStep: number;
  /** Button label override (default "Save & Continue"). */
  nextLabel?: string;
  /** Disable the Next button until the step validates. */
  canContinue: boolean;
  /** Called when the user presses Next. Must resolve on success. */
  onContinue: () => Promise<void>;
  children: ReactNode;
  /** Hide the Back button (e.g. Step 1). */
  hideBack?: boolean;
  /** Hide the Next button — used when the step owns its own submit flow
   *  (e.g. Step 7 has an internal "Submit for review" button that only
   *  appears after the user has recorded + reviewed the video). */
  hideNext?: boolean;
}

export default function WizardShell({
  currentStep,
  nextLabel = 'Save & Continue',
  canContinue,
  onContinue,
  children,
  hideBack,
  hideNext,
}: WizardShellProps) {
  const router = useRouter();
  const { saveStatus } = useProviderOnboarding();
  const totalSteps = 7;
  const pct = Math.round((currentStep / totalSteps) * 100);

  const handleNext = async () => {
    try {
      await onContinue();
      if (currentStep < totalSteps) {
        router.push(`/provider-onboarding/step-${currentStep + 1}`);
      } else {
        router.push('/provider-onboarding/submitted');
      }
    } catch (err) {
      // Step's onContinue throws with a user-safe message; let it propagate
      // to the step-local toast / inline error without breaking the shell.
      // The step component is responsible for rendering the message.
      console.error('[wizard] continue failed', err);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      router.push(`/provider-onboarding/step-${currentStep - 1}`);
    } else {
      router.back();
    }
  };

  return (
    <div
      className="min-h-svh flex flex-col bg-[#F7EFE1] text-[#0F2452]"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {/* ── Header with progress ─────────────────────────────── */}
      <header className="px-5 pt-8 pb-4 border-b border-[#0F2452]/10">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-700/60 font-medium">
              Step {currentStep} of {totalSteps}
            </p>
            <h1 className="text-xl font-semibold mt-0.5">
              {STEP_LABELS[currentStep] ?? '…'}
            </h1>
          </div>
          <SaveStatusBadge status={saveStatus} />
        </div>

        <div
          className="mt-4 h-1.5 rounded-full bg-[#0F2452]/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-[#C8932A] transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      {/* ── Step content ─────────────────────────────────────── */}
      <main className="flex-1 px-5 py-6">
        <div className="max-w-xl mx-auto">{children}</div>
      </main>

      {/* ── Sticky footer ────────────────────────────────────── */}
      <footer className="sticky bottom-0 bg-[#F7EFE1]/95 backdrop-blur border-t border-[#0F2452]/10 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {!hideBack && (
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-3 rounded-xl text-gray-700 font-medium
                         border border-[#0F2452]/20 hover:bg-[#0F2452]/5
                         active:scale-[0.98] transition"
            >
              Back
            </button>
          )}
          {!hideNext && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canContinue}
              className="flex-1 px-5 py-3 rounded-xl font-semibold text-[#F7EFE1]
                         bg-[#0F2452] disabled:bg-[#0F2452]/40
                         disabled:cursor-not-allowed
                         hover:bg-[#0F2452] active:scale-[0.98] transition"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function SaveStatusBadge({
  status,
}: {
  status: 'idle' | 'saving' | 'synced' | 'offline';
}) {
  if (status === 'saving')
    return <span className="text-xs text-gray-700/60">Saving…</span>;
  if (status === 'synced')
    return <span className="text-xs text-green-800/80">Saved</span>;
  if (status === 'offline')
    return (
      <span className="text-xs text-orange-800/90">
        Offline — will retry
      </span>
    );
  return null;
}
