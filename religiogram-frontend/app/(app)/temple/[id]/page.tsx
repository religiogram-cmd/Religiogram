'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { TempleDetail } from '@/components/temples/TempleDetail';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { ReviewInput } from '@/components/reviews/ReviewInput';

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function ReviewSkeleton() {
  return (
    <div className="space-y-3 px-4">
      {[1, 2].map((i) => (
        <div key={i} className="bg-white/60 rounded-2xl p-4 animate-pulse">
          <div className="flex gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#F6F7FA]" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-24 bg-[#F6F7FA] rounded" />
              <div className="h-3 w-16 bg-[#F6F7FA] rounded" />
            </div>
          </div>
          <div className="h-3 w-full bg-[#F6F7FA] rounded" />
          <div className="h-3 w-3/4 bg-[#F6F7FA] rounded mt-1" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewsSection — all hooks at top level, no conditional hook calls
// ---------------------------------------------------------------------------

interface Review {
  id: string;
  rating: number;
  body?: string;
  createdAt: string;
  user: { name: string; avatarUrl?: string };
  isVerifiedPurchase?: boolean;
  [key: string]: unknown;
}

interface ReviewsSectionProps {
  templeId: string;
}

function ReviewsSection({ templeId }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Use NEXT_PUBLIC_API_BASE — the single env var that points at the
  // backend (e.g. https://religiogram-backend.up.railway.app/api/v1).
  // Falls back to the local mock at :3001/api/v1 in dev.
  const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`${API}/reviews?reviewableType=temple&reviewableId=${templeId}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setReviews(d?.data?.items ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [templeId, refreshKey, API]);

  return (
    <section className="py-4">
      <div className="px-4 mb-3">
        <h2 className="text-base font-cinzel font-semibold text-gray-700">
          Reviews &amp; Ratings
        </h2>
      </div>

      <div className="px-4 mb-4">
        <ReviewInput
          reviewableType="temple"
          reviewableId={templeId}
          onSuccess={() => setRefreshKey((k: any) => k + 1)}
        />
      </div>

      {loading ? (
        <ReviewSkeleton />
      ) : error ? (
        <p className="px-4 text-sm text-gray-500">Could not load reviews.</p>
      ) : reviews.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-2xl mb-1">🙏</p>
          <p className="text-sm text-[#0F2452]/70">Be the first to leave a review</p>
        </div>
      ) : (
        <div className="space-y-3 px-4">
          {reviews.map((r: any) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  if (!id) return null;

  return (
    <div>
      <TempleDetail id={id} />
      <Suspense fallback={<ReviewSkeleton />}>
        <ReviewsSection templeId={id} />
      </Suspense>
    </div>
  );
}
