'use client';

/**
 * /become-provider — legacy redirect.
 *
 * The category chooser now lives INSIDE `/provider-onboarding` so there's
 * a single entry point from the profile menu. This page just forwards.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BecomeProviderRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/provider-onboarding'); }, [router]);
  return null;
}
