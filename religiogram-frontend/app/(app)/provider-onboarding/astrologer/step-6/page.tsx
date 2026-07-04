'use client';

import Step_Availability from '@/components/provider-onboarding/steps/Step_Availability';
import {
  ASTROLOGER_STEP_LABELS,
  ASTROLOGER_TOTAL_STEPS,
  ASTROLOGER_ROUTE_BASE,
} from '@/components/provider-onboarding/steps/flows';

export default function Page() {
  return (
    <Step_Availability
      flow={{
        currentStep: 6,
        totalSteps: ASTROLOGER_TOTAL_STEPS,
        stepLabels: ASTROLOGER_STEP_LABELS,
        routeBase: ASTROLOGER_ROUTE_BASE,
        advanceTo: 7,
      }}
      intro="When will you be online to take consultations? Devotees can only start a chat, voice, or video call during your available windows."
      gateStrategy="astrologerPerMinute"
      gateFallbackPath={`${ASTROLOGER_ROUTE_BASE}/step-5`}
    />
  );
}
