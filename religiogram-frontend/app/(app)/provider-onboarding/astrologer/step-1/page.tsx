'use client';

import Step_BasicDetails from '@/components/provider-onboarding/steps/Step_BasicDetails';
import {
  ASTROLOGER_STEP_LABELS,
  ASTROLOGER_TOTAL_STEPS,
  ASTROLOGER_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_BasicDetails
      flow={{
        currentStep: 1,
        totalSteps: ASTROLOGER_TOTAL_STEPS,
        stepLabels: ASTROLOGER_STEP_LABELS,
        routeBase: ASTROLOGER_ROUTE_BASE,
        advanceTo: 2,
      }}
    />
  );
}
