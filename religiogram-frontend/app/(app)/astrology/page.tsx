'use client';

import AstrologyScreen from '@/components/astrology/AstrologyScreen';

/**
 * /astrology — hub screen.
 *
 * The floating AstroAIChat bubble was removed per user request. The AI Chat
 * tab (if present) is also stripped inside AstrologyScreen; the primary AI
 * assistant remains available via the dedicated /rg-ai route.
 */
export default function AstrologyPage() {
  return <AstrologyScreen />;
}
