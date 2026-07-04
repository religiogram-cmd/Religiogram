'use client';

import Step_Pricing from '@/components/provider-onboarding/steps/Step_Pricing';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Pricing
      flow={{
        currentStep: 5,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 6,
      }}
      faithStepPath={`${BOTH_ROUTE_BASE}/step-3`}
      servicesStepPath={`${BOTH_ROUTE_BASE}/step-4`}
    />
  );
}
