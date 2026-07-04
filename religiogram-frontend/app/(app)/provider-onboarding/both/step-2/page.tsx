'use client';

import Step_AboutYou from '@/components/provider-onboarding/steps/Step_AboutYou';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_AboutYou
      flow={{
        currentStep: 2,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 3,
      }}
    />
  );
}
