'use client';

import Step_BasicDetails from '@/components/provider-onboarding/steps/Step_BasicDetails';
import {
  PRIEST_STEP_LABELS,
  PRIEST_TOTAL_STEPS,
  PRIEST_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_BasicDetails
      flow={{
        currentStep: 1,
        totalSteps: PRIEST_TOTAL_STEPS,
        stepLabels: PRIEST_STEP_LABELS,
        routeBase: PRIEST_ROUTE_BASE,
        advanceTo: 2,
      }}
    />
  );
}
