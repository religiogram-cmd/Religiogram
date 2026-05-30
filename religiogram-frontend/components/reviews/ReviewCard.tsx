'use client';

import { formatDistanceToNow, parseISO } from 'date-fns';

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    body?: string;
    createdAt: string;
    user: { name: string; avatarUrl?: string };
    isVerifiedPurchase?: boolean;
  };
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <svg
          key={i}
          className={`w-3.5 h-3.5 ${i < rating ? 'text-gold-500' : 'text-gray-200'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function AvatarFallback({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const colors = [
    ['#FF6B00', '#FFa040'],
    ['#8B0000', '#c0392b'],
    ['#1a5276', '#2980b9'],
    ['#145a32', '#27ae60'],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const [c1, c2] = colors[idx];
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  );
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        {review.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.user.avatarUrl}
            alt={review.user.name}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <AvatarFallback name={review.user.name} size={36} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm leading-tight">{review.user.name}</p>
            {review.isVerifiedPurchase && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">
                ✓ Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating rating={review.rating} />
            <span className="text-[10px] text-gray-400">
              {formatDistanceToNow(parseISO(review.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Numeric rating badge */}
        <div className="flex items-center gap-0.5 bg-gold-500/10 rounded-lg px-2 py-1 flex-shrink-0">
          <span className="text-sm font-bold text-gold-600">{review.rating}</span>
          <svg className="w-3 h-3 text-gold-500" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
      </div>

      {/* Review body */}
      {review.body && (
        <p className="text-sm text-gray-700 leading-relaxed">{review.body}</p>
      )}
    </div>
  );
}
