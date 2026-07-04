'use client';

import Step_BasicDetails from '@/components/provider-onboarding/steps/Step_BasicDetails';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_BasicDetails
      flow={{
        currentStep: 1,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 2,
      }}
    />
  );
}
