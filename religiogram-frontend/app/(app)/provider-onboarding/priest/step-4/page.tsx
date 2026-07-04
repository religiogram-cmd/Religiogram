'use client';

import Step_ServicesPicker from '@/components/provider-onboarding/steps/Step_ServicesPicker';
import {
  PRIEST_STEP_LABELS,
  PRIEST_TOTAL_STEPS,
  PRIEST_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_ServicesPicker
      flow={{
        currentStep: 4,
        totalSteps: PRIEST_TOTAL_STEPS,
        stepLabels: PRIEST_STEP_LABELS,
        routeBase: PRIEST_ROUTE_BASE,
        advanceTo: 5,
      }}
      faithStepPath={`${PRIEST_ROUTE_BASE}/step-3`}
    />
  );
}
