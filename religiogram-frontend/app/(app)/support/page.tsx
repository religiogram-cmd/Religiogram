'use client';

import { useRouter } from 'next/navigation';
import SupportScreen from '@/components/support/SupportScreen';

export default function SupportPage() {
  const router = useRouter();
  return <SupportScreen onBack={() => router.back()} />;
}
