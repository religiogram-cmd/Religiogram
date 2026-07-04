'use client';

import Step_ServicesPicker from '@/components/provider-onboarding/steps/Step_ServicesPicker';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_ServicesPicker
      flow={{
        currentStep: 4,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 5,
      }}
      faithStepPath={`${BOTH_ROUTE_BASE}/step-3`}
    />
  );
}
