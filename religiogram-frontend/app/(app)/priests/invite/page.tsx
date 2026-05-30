'use client';
import { Suspense } from 'react';
import PriestInviteBookingScreen from '@/components/priests/PriestInviteBookingScreen';

export default function Page() {
  // useSearchParams must be inside a Suspense boundary in Next 15
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8B6B35' }}>Loading…</div>}>
      <PriestInviteBookingScreen />
    </Suspense>
  );
}
