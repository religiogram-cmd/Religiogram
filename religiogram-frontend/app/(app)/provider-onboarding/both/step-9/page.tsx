'use client';

import Step_PerMinuteRate from '@/components/provider-onboarding/steps/Step_PerMinuteRate';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_PerMinuteRate
      flow={{
        currentStep: 9,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 10,
      }}
    />
  );
}
