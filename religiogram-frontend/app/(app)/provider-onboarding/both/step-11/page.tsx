'use client';

import Step_Identity from '@/components/provider-onboarding/steps/Step_Identity';
import {
  BOTH_STEP_LABELS,
  BOTH_TOTAL_STEPS,
  BOTH_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Identity
      flow={{
        currentStep: 11,
        totalSteps: BOTH_TOTAL_STEPS,
        stepLabels: BOTH_STEP_LABELS,
        routeBase: BOTH_ROUTE_BASE,
        advanceTo: 12,
      }}
      nextStepPath={`${BOTH_ROUTE_BASE}/step-12`}
      gateCheck={(data) => {
        if (!data.religion) return `${BOTH_ROUTE_BASE}/step-3`;
        if (!data.pricing?.length) return `${BOTH_ROUTE_BASE}/step-5`;
        if (!data.slots?.length) return `${BOTH_ROUTE_BASE}/step-6`;
        if (!data.specialisations?.length) return `${BOTH_ROUTE_BASE}/step-7`;
        if (!data.consultationChannels?.length) return `${BOTH_ROUTE_BASE}/step-8`;
        if (!data.perMinutePaise) return `${BOTH_ROUTE_BASE}/step-9`;
        return null;
      }}
    />
  );
}
