/**
 * Provider-onboarding route layout.
 *
 * Wraps every step in the Context provider so form state is preserved
 * across navigations between /step-1 → /step-7 without a remount.
 */

import { ProviderOnboardingProvider } from '@/lib/provider-onboarding-store';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Become a Service Provider — ReligioGram',
};

export default function ProviderOnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProviderOnboardingProvider>{children}</ProviderOnboardingProvider>;
}
