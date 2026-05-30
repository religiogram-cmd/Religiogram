'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OnlineConsultationScreen from '@/components/consultation/OnlineConsultationScreen';
import AskPriestScreen from '@/components/priests/AskPriestScreen';

function ConsultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const faith = params?.get('faith');

  // Faith-specific Ask-a-Priest flow: shows per-minute consultation tiers
  // for that religion's priests. Wired in from PriestsScreen.tsx.
  if (faith && ['hindu','muslim','sikh','christian'].includes(faith)) {
    return <AskPriestScreen />;
  }

  // Default: generic browse of all available consultants
  return (
    <OnlineConsultationScreen
      onBack={() => router.back()}
      onStartSession={(providerId, mode) => {
        router.push(`/consultation/sess-${providerId}-${mode}`);
      }}
    />
  );
}

export default function ConsultBrowsePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#8B6B35' }}>Loading…</div>}>
      <ConsultInner />
    </Suspense>
  );
}
