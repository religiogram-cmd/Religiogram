/**
 * Shared configuration passed to every step component so it knows which
 * sub-flow (priest / astrologer / both) it is rendering inside.
 *
 * The wizard was originally a single linear route tree at
 * `/provider-onboarding/step-N`. When we split it into three sub-flows we
 * needed the step components to be flow-aware — same step content, but
 * different progress bar total, different labels, and different next/prev
 * routes.
 *
 * Every reusable step in `components/provider-onboarding/steps/*` accepts a
 * `flow: FlowConfig` prop so the route pages can wire the correct chrome.
 */

import type { ReactNode } from 'react';

export interface FlowConfig {
  /** 1-based position of the current step inside this flow. */
  currentStep: number;
  /** Total steps in this flow (Priest: 9, Astrologer: 9, Both: 12). */
  totalSteps: number;
  /** Label lookup for the WizardShell header. */
  stepLabels: Record<number, string>;
  /** Base path for Back / Next routing, e.g. "/provider-onboarding/astrologer". */
  routeBase: string;
  /** The store's `advance()` monotonic step counter target. Usually equals
   *  `currentStep + 1` but exposed explicitly so a step doesn't guess. */
  advanceTo: number;
  /** Optional banner rendered between the header and the step body. The
   *  Both-flow uses this to signal the seam between priest and astrologer
   *  content on step 7. */
  banner?: ReactNode;
}
