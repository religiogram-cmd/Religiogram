'use client';

/**
 * Both-flow step 7 — the seam. First astrologer question after 6 priest
 * questions. We render the BothFlowBanner so the user gets an obvious
 * visual cue that the questions are changing shape (astrology consultation
 * work, not pooja services).
 */

import Step_Specialisations from '@/components/provider-onboarding/steps/Step_Specialisations';
import BothFlowBanner from '@/components/provider-onboarding/BothFlowBanner';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Specialisations
      flow={{
        currentStep: 7,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 8,
        banner: <BothFlowBanner side="astrology" />,
      }}
    />
  );
}
