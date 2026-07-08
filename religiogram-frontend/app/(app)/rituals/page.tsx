import { Suspense } from 'react';
import RitualsScreen from '@/components/rituals/RitualsScreen';

// Wrapped in Suspense because RitualsScreen calls useSearchParams()
// (to honour ?faith=... from the Home page's faith cards). Next.js 15
// requires client components using useSearchParams to have a Suspense
// boundary or the whole route will opt out of static rendering with a
// build-time warning.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RitualsScreen />
    </Suspense>
  );
}
