'use client';

/**
 * Legacy /provider-onboarding/step-1 route. The wizard was split into
 * priest / astrologer / both sub-flows; this redirects to whichever
 * matches the draft's providerCategory. Kept in place so old bookmarks,
 * deep-links, and in-flight sessions keep working.
 */

import LegacyStepRedirect from '@/components/provider-onboarding/LegacyStepRedirect';

export default function Page() {
  return <LegacyStepRedirect step={1} />;
}
