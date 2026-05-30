import { Suspense } from 'react';
import VerifyOtpScreen from '@/components/auth/VerifyOtpScreen';

export default function Page() {
  return (
    <Suspense>
      <VerifyOtpScreen />
    </Suspense>
  );
}
