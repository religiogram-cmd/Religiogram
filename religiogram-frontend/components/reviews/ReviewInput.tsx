'use client';

import { useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

interface ReviewInputProps {
  reviewableType: 'temple' | 'provider' | 'place';
  reviewableId: string;
  onSuccess?: () => void;
}

export function ReviewInput({ reviewableType, reviewableId, onSuccess }: ReviewInputProps) {
  const { accessToken } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!accessToken) { setError('Please sign in to leave a review'); return; }
    if (rating === 0) { setError('Please select a rating'); return; }
    setError('');
    setLoading(true);
    try {
      await axios.post(
        `${API}/reviews`,
        {
          reviewableType,
          reviewableId,
          rating,
          body: body.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setDone(true);
      onSuccess?.();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ?? 'Failed to submit review. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
        <div className="text-3xl mb-2">🙏</div>
        <p className="font-semibold text-green-700 text-sm">Thank you for your review!</p>
        <p className="text-xs text-green-600 mt-1">Your feedback helps the community</p>
      </div>
    );
  }

  const RATING_LABELS: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  };

  const activeRating = hovered || rating;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <h3 className="font-cinzel font-semibold text-sacred-700 text-base mb-4">
        Write a Review
      </h3>

      {/* Star selector */}
      <div className="flex flex-col items-center mb-4">
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="active:scale-90 transition-transform"
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <svg
                className={`w-9 h-9 transition-colors ${
                  star <= activeRating ? 'text-gold-500' : 'text-gray-200'
                }`}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          ))}
        </div>
        {activeRating > 0 && (
          <span className="text-sm font-semibold text-gray-600">
            {RATING_LABELS[activeRating]}
          </span>
        )}
        {activeRating === 0 && (
          <span className="text-sm text-gray-400">Tap to rate</span>
        )}
      </div>

      {/* Text area */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          Your Review <span className="font-normal normal-case">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your experience..."
          maxLength={500}
          className="input-field resize-none text-sm"
        />
        <p className="text-right text-[10px] text-gray-300 mt-1">{body.length}/500</p>
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-3">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || rating === 0}
        className="btn-saffron w-full text-sm"
      >
        {loading ? 'Submitting...' : 'Submit Review'}
      </button>
    </div>
  );
}
