'use client';

import Step_ConsultationChannels from '@/components/provider-onboarding/steps/Step_ConsultationChannels';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_ConsultationChannels
      flow={{
        currentStep: 8,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 9,
      }}
    />
  );
}
