'use client';

import Step_Availability from '@/components/provider-onboarding/steps/Step_Availability';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Availability
      flow={{
        currentStep: 6,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 7,
      }}
      intro="Tell us when you're generally free to accept in-person visits. Devotees will only be able to book during your available windows — minus any breaks you set."
      gateStrategy="priestServices"
      gateFallbackPath={`${BOTH_ROUTE_BASE}/step-5`}
    />
  );
}
