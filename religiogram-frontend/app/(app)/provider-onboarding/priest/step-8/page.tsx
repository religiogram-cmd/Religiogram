'use client';

import Step_Identity from '@/components/provider-onboarding/steps/Step_Identity';
import {
  PRIEST_STEP_LABELS,
  PRIEST_TOTAL_STEPS,
  PRIEST_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Identity
      flow={{
        currentStep: 8,
        totalSteps: PRIEST_TOTAL_STEPS,
        stepLabels: PRIEST_STEP_LABELS,
        routeBase: PRIEST_ROUTE_BASE,
        advanceTo: 9,
      }}
      nextStepPath={`${PRIEST_ROUTE_BASE}/step-9`}
      gateCheck={(data) => {
        if (!data.religion) return `${PRIEST_ROUTE_BASE}/step-3`;
        if (!data.pricing?.length) return `${PRIEST_ROUTE_BASE}/step-5`;
        if (!data.slots?.length) return `${PRIEST_ROUTE_BASE}/step-6`;
        return null;
      }}
    />
  );
}
