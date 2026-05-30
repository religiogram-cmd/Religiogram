'use client';

import { useState } from 'react';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';
import type React from 'react';
import type { SessionSummary } from './ActiveSessionScreen';

const NAVY = '#1B2A5C';
const GOLD = '#C8920A';
const PARCHMENT = '#FFFBF0';

const REVIEW_TAGS = [
  'Very knowledgeable', 'Patient', 'Accurate', 'Helpful', 'Spiritual',
];

interface Props {
  summary: SessionSummary;
  onReviewSubmit?: (rating: number, text: string) => void;
  onBookAgain?: () => void;
  onDone?: () => void;
  onInviteFriend?: () => void;
  onViewHistory?: () => void;
}


/** PDF §9.5 — religion-themed header watermark symbols */
const RELIGION_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  hindu:     { symbol: 'ॐ',  color: 'rgba(255,153,0,0.18)'  },
  muslim:    { symbol: '☪',  color: 'rgba(255,255,255,0.12)' },
  sikh:      { symbol: 'ੴ',  color: 'rgba(255,200,0,0.18)'  },
  christian: { symbol: '✝',  color: 'rgba(255,255,255,0.14)' },
};

function religionWatermarkStyle(religion?: string): React.CSSProperties {
  if (!religion) return {};
  const key = religion.toLowerCase();
  const meta = RELIGION_SYMBOLS[key];
  if (!meta) return {};
  return {
    // overlaid as a CSS pseudo-content via boxShadow trick is not possible in inline styles,
    // so we return an SVG data URI background
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='120' fill='${encodeURIComponent(meta.color)}'>${encodeURIComponent(meta.symbol)}</text></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundSize: '160px 160px',
  };
}

export default function SessionCompletionScreen({
  summary,
  onReviewSubmit,
  onBookAgain,
  onDone,
  onInviteFriend,
  onViewHistory,
}: Props) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const totalSeconds = summary.durationSeconds;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const durationLabel = `${mins} min ${secs} sec`;

  const billableMins = secs > 30 ? mins + 1 : mins;
  const subtotal = billableMins * summary.ratePerMin;
  const platformFeeRate = 0.03;
  const platformFee = subtotal * platformFeeRate;
  const total = subtotal + platformFee;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitReview = () => {
    if (rating === 0) return;
    setSubmitted(true);
    if (onReviewSubmit) onReviewSubmit(rating, reviewText);
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: PARCHMENT,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, #2a3f80 100%)`,
        padding: '52px 20px 32px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        ...religionWatermarkStyle(summary.religion),
      }}>
        {/* Gold checkmark */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: 30,
          boxShadow: `0 0 0 6px rgba(200,146,10,0.25), 0 4px 20px rgba(200,146,10,0.4)`,
        }}>✓</div>

        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: 22, margin: '0 0 4px' }}>
          Session Completed Successfully
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
          with {summary.consultantName}
        </p>
      </div>

      <div style={{ padding: '0 20px 100px', maxWidth: 480, margin: '0 auto' }}>

        {/* ── Cashback Badge ── */}
        {summary.cashbackEarned && (
          <div style={{
            margin: '20px 0 0',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 4px 20px rgba(22,163,74,0.3)',
          }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>🎁</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
                {formatRupees(50)} Cashback Earned!
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>
                Credited to your ReligioGram wallet instantly.
                Valid for your next session.
              </div>
            </div>
          </div>
        )}

        {/* ── Session summary card ── */}
        <div style={{
          backgroundColor: '#fff', borderRadius: 16,
          padding: '20px', marginTop: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <p style={{ color: NAVY, fontWeight: 700, fontSize: 16, margin: '0 0 14px' }}>
            Session Summary
          </p>
          {[
            ['Duration', durationLabel],
            ['Rate', formatPerMinute(summary.ratePerMin * 100)],
            ['Subtotal', formatRupees(subtotal)],
            ['Platform fee', formatRupees(platformFee)],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: '1px solid #f1f5f9',
              fontSize: 14, color: '#374151',
            }}>
              <span>{label}</span>
              <span style={{ fontWeight: 500 }}>{value}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '12px 0 0',
            fontSize: 15, color: NAVY,
          }}>
            <span style={{ fontWeight: 700 }}>Total Charged</span>
            <span style={{ fontWeight: 800 }}>{formatRupees(summary.amountCharged)}</span>
          </div>
        </div>

        {/* ── Rating ── */}
        {!submitted ? (
          <div style={{
            backgroundColor: '#fff', borderRadius: 16,
            padding: '20px', marginTop: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <p style={{ color: NAVY, fontWeight: 700, fontSize: 16, margin: '0 0 14px' }}>
              How was your session?
            </p>

            {/* Stars */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => setRating(star)}
                  style={{
                    fontSize: 32, background: 'none', border: 'none',
                    cursor: 'pointer', padding: 2,
                    opacity: star <= (hoveredStar || rating) ? 1 : 0.3,
                    transition: 'opacity 0.15s',
                  }}
                >
                  ⭐
                </button>
              ))}
            </div>

            {/* Quick-tags */}
            {rating > 0 && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, justifyContent: 'center' }}>
                  {REVIEW_TAGS.map((tag) => {
                    const on = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 99,
                          border: `1.5px solid ${on ? GOLD : '#e5e7eb'}`,
                          backgroundColor: on ? `${GOLD}18` : '#f9fafb',
                          color: on ? GOLD : '#6b7280',
                          fontSize: 12, fontWeight: on ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
                  placeholder="Share more about your experience…"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '1.5px solid #e5e7eb', borderRadius: 10,
                    fontSize: 14, resize: 'none', outline: 'none',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', margin: '4px 0 12px' }}>
                  {reviewText.length}/500
                </p>

                <button
                  onClick={handleSubmitReview}
                  style={{
                    width: '100%', padding: '13px',
                    backgroundColor: GOLD, color: '#fff',
                    border: 'none', borderRadius: 12,
                    fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  Submit Review
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f0fdf4', borderRadius: 16,
            padding: '20px', marginTop: 16, textAlign: 'center',
            border: '1.5px solid #bbf7d0',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🙏</div>
            <p style={{ color: '#166534', fontWeight: 700, fontSize: 16, margin: 0 }}>
              Thank you for your review!
            </p>
            <p style={{ color: '#4ade80', fontSize: 13, margin: '4px 0 0' }}>
              Your feedback helps other devotees.
            </p>
          </div>
        )}

        {/* ── CTAs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {onBookAgain && (
            <button
              onClick={onBookAgain}
              style={{
                width: '100%', padding: '15px',
                background: `linear-gradient(135deg, ${NAVY}, #2d4a9e)`,
                color: '#fff',
                border: 'none', borderRadius: 14,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                boxShadow: `0 4px 14px rgba(27,42,92,0.3)`,
              }}
            >
              📅 Book Again
            </button>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {onInviteFriend && (
              <button
                onClick={onInviteFriend}
                style={{
                  flex: 1, padding: '13px',
                  backgroundColor: '#f0f4ff',
                  color: NAVY,
                  border: `1.5px solid ${NAVY}30`,
                  borderRadius: 12,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                👥 Invite Friend
              </button>
            )}
            {onViewHistory && (
              <button
                onClick={onViewHistory}
                style={{
                  flex: 1, padding: '13px',
                  backgroundColor: '#fafafa',
                  color: '#374151',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                📋 View History
              </button>
            )}
          </div>

          <button
            onClick={onDone}
            style={{
              width: '100%', padding: '13px',
              backgroundColor: 'transparent', color: '#9ca3af',
              border: 'none',
              fontWeight: 500, fontSize: 14, cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
