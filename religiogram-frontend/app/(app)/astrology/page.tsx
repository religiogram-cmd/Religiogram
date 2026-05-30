'use client';

import dynamic from 'next/dynamic';
import AstrologyScreen from '@/components/astrology/AstrologyScreen';

const AstroAIChat = dynamic(() => import('@/components/astrology/AstroAIChat'), { ssr: false });

export default function AstrologyPage() {
  return (
    <>
      <AstrologyScreen />
      <AstroAIChat />
    </>
  );
}
