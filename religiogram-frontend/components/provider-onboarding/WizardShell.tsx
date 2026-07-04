'use client';

import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';

/**
 * WizardShell — layout frame shared by every onboarding step.
 *
 * Responsibilities:
 *   - Show a persistent progress bar ("Step X of N")
 *   - Render a sticky footer with Back / Save & Next buttons
 *   - Surface sync status ("Saving…" / "Saved" / "Offline — will retry")
 *   - Block forward navigation with a per-step `canContinue` gate
 *
 * Sub-flow awareness:
 *   The wizard is split into three parallel route trees rooted at
 *   `/provider-onboarding/{priest,astrologer,both}/step-N`. Each flow can have
 *   a different total step count (Priest: 9, Astrologer: 9, Both: 12) and its
 *   own labels. To keep the shell decoupled from routing, the caller passes
 *   `totalSteps`, `stepLabels`, and `routeBase` (e.g. "/provider-onboarding/
 *   astrologer"). Legacy callers that omit these props fall back to the
 *   original 9-step priest labels and root path, so the pre-split routes keep
 *   working during the transition.
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
  8: 'Identity documents',
  9: 'Payout setup',
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
  /** Override the number of steps in this flow. Defaults to 9 (the legacy
   *  priest count). Both-flow passes 12. */
  totalSteps?: number;
  /** Override the labels shown in the header. Defaults to STEP_LABELS. */
  stepLabels?: Record<number, string>;
  /** Base path for Back / Next navigation, e.g. "/provider-onboarding/priest".
   *  Defaults to "/provider-onboarding" for legacy routes. */
  routeBase?: string;
  /** Optional banner rendered between the header and the step content. Used
   *  by the Both-flow to signal the seam between priest and astrologer
   *  content (see BothFlowBanner). */
  banner?: ReactNode;
}

export default function WizardShell({
  currentStep,
  nextLabel = 'Save & Continue',
  canContinue,
  onContinue,
  children,
  hideBack,
  hideNext,
  totalSteps = 9,
  stepLabels = STEP_LABELS,
  routeBase = '/provider-onboarding',
  banner,
}: WizardShellProps) {
  const router = useRouter();
  const { saveStatus } = useProviderOnboarding();
  const pct = Math.round((currentStep / totalSteps) * 100);

  /* Local in-flight flag so the Next button can show a spinner and disable
   * itself while the save + route-transition happen. Without this the user
   * sees a completely inert button for 300–900ms and thinks the app hung. */
  const [isSaving, setIsSaving] = useState(false);

  const handleNext = async () => {
    if (isSaving) return; // guard against double-clicks
    setIsSaving(true);
    try {
      await onContinue();
      // We keep isSaving=true through the router.push so the spinner covers
      // the tiny gap before the next step's page mounts — otherwise the
      // button briefly re-enables and looks glitchy.
      if (currentStep < totalSteps) {
        router.push(`${routeBase}/step-${currentStep + 1}`);
      } else {
        router.push('/provider-onboarding/submitted');
      }
    } catch (err) {
      // Step's onContinue throws with a user-safe message; let it propagate
      // to the step-local toast / inline error without breaking the shell.
      // The step component is responsible for rendering the message.
      console.error('[wizard] continue failed', err);
      setIsSaving(false); // only reset on failure — success unmounts us
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      router.push(`${routeBase}/step-${currentStep - 1}`);
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
              {stepLabels[currentStep] ?? '…'}
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

      {/* ── Optional flow banner (used by Both flow between priest/astro seam) ── */}
      {banner}

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
              disabled={!canContinue || isSaving}
              aria-busy={isSaving}
              className="flex-1 px-5 py-3 rounded-xl font-semibold text-[#F7EFE1]
                         bg-[#0F2452] disabled:bg-[#0F2452]/40
                         disabled:cursor-not-allowed
                         hover:bg-[#0F2452] active:scale-[0.98] transition
                         flex items-center justify-center gap-2"
            >
              {isSaving && (
                <span
                  aria-hidden
                  className="inline-block w-4 h-4 rounded-full border-2
                             border-[#F7EFE1]/40 border-t-[#F7EFE1] animate-spin"
                />
              )}
              <span>{isSaving ? 'Saving…' : nextLabel}</span>
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
    return (
      <span className="text-xs text-[#0F2452]/80 font-medium flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block w-3 h-3 rounded-full border-2
                     border-[#0F2452]/20 border-t-[#C8932A] animate-spin"
        />
        Saving…
      </span>
    );
  if (status === 'synced')
    return (
      <span className="text-xs text-green-800/90 font-medium flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Saved
      </span>
    );
  if (status === 'offline')
    return (
      <span className="text-xs text-orange-800/90 font-medium">
        Offline — will retry
      </span>
    );
  return null;
}
