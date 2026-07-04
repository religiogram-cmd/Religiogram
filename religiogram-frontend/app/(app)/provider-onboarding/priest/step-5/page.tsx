'use client';

import Step_Pricing from '@/components/provider-onboarding/steps/Step_Pricing';
import {
  PRIEST_STEP_LABELS,
  PRIEST_TOTAL_STEPS,
  PRIEST_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Pricing
      flow={{
        currentStep: 5,
        totalSteps: PRIEST_TOTAL_STEPS,
        stepLabels: PRIEST_STEP_LABELS,
        routeBase: PRIEST_ROUTE_BASE,
        advanceTo: 6,
      }}
      faithStepPath={`${PRIEST_ROUTE_BASE}/step-3`}
      servicesStepPath={`${PRIEST_ROUTE_BASE}/step-4`}
    />
  );
}
