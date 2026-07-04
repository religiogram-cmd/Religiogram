'use client';

import Step_Availability from '@/components/provider-onboarding/steps/Step_Availability';
import {
  PRIEST_STEP_LABELS,
  PRIEST_TOTAL_STEPS,
  PRIEST_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Availability
      flow={{
        currentStep: 6,
        totalSteps: PRIEST_TOTAL_STEPS,
        stepLabels: PRIEST_STEP_LABELS,
        routeBase: PRIEST_ROUTE_BASE,
        advanceTo: 7,
      }}
      intro="Tell us when you're generally free to accept in-person and online bookings. Devotees will only be able to book during your available windows — minus any breaks you set."
      gateStrategy="priestServices"
      gateFallbackPath={`${PRIEST_ROUTE_BASE}/step-5`}
    />
  );
}
