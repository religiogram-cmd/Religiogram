'use client';

import Step_AboutYou from '@/components/provider-onboarding/steps/Step_AboutYou';
import {
  ASTROLOGER_STEP_LABELS,
  ASTROLOGER_TOTAL_STEPS,
  ASTROLOGER_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_AboutYou
      flow={{
        currentStep: 2,
        totalSteps: ASTROLOGER_TOTAL_STEPS,
        stepLabels: ASTROLOGER_STEP_LABELS,
        routeBase: ASTROLOGER_ROUTE_BASE,
        advanceTo: 3,
      }}
    />
  );
}
