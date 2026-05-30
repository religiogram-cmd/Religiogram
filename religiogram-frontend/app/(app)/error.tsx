'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[App Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70svh] px-6">
      <div className="text-center max-w-xs">
        <div className="text-5xl mb-4">🌸</div>
        <h2 className="font-cinzel text-lg font-semibold text-sacred-700 mb-2">
          Something didn&apos;t load
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || 'Please try again.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-saffron-500 text-white active:scale-95 transition-transform"
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/home')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border-2 border-saffron-500 text-saffron-500 active:scale-95 transition-transform"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
