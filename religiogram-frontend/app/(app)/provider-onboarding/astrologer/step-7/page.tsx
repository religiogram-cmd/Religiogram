'use client';

import Step_Kyc from '@/components/provider-onboarding/steps/Step_Kyc';
import {
  ASTROLOGER_STEP_LABELS,
  ASTROLOGER_TOTAL_STEPS,
  ASTROLOGER_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Kyc
      flow={{
        currentStep: 7,
        totalSteps: ASTROLOGER_TOTAL_STEPS,
        stepLabels: ASTROLOGER_STEP_LABELS,
        routeBase: ASTROLOGER_ROUTE_BASE,
        advanceTo: 8,
      }}
      nextStepPath={`${ASTROLOGER_ROUTE_BASE}/step-8`}
      gateCheck={(data) => {
        if (!data.specialisations?.length) return `${ASTROLOGER_ROUTE_BASE}/step-3`;
        if (!data.consultationChannels?.length) return `${ASTROLOGER_ROUTE_BASE}/step-4`;
        if (!data.perMinutePaise) return `${ASTROLOGER_ROUTE_BASE}/step-5`;
        if (!data.slots?.length) return `${ASTROLOGER_ROUTE_BASE}/step-6`;
        return null;
      }}
    />
  );
}
