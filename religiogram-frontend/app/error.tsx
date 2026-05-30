'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ReligioGram Error]', error);
  }, [error]);

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6 bg-parchment-100">
      <div className="text-center max-w-xs">
        <div className="text-5xl mb-4">🙏</div>
        <h1 className="font-cinzel text-xl font-semibold text-sacred-700 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="btn-saffron px-8 py-3 rounded-xl text-sm font-semibold bg-saffron-500 text-white w-full"
        >
          Try again
        </button>
        <a
          href="/home"
          className="block mt-3 text-sm text-[#0F2452] underline underline-offset-2"
        >
          Go to Home
        </a>
      </div>
    </div>
  );
}
