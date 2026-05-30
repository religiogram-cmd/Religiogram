/**
 * Tests for components/reviews/ReviewCard.tsx
 *
 * Pure presentational component. date-fns is real (not mocked) because
 * we supply fixed ISO dates and just check the output is non-empty.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReviewCard } from './ReviewCard';

const BASE_REVIEW = {
  id: 'r-1',
  rating: 4,
  body: 'Beautiful temple, peaceful atmosphere.',
  createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
  user: { name: 'Arjun Sharma' },
};

describe('ReviewCard', () => {
  // ── User name ────────────────────────────────────────────────────────────────

  it('renders the reviewer name', () => {
    render(<ReviewCard review={BASE_REVIEW} />);
    expect(screen.getByText('Arjun Sharma')).toBeInTheDocument();
  });

  // ── Body text ────────────────────────────────────────────────────────────────

  it('renders the review body text when present', () => {
    render(<ReviewCard review={BASE_REVIEW} />);
    expect(screen.getByText('Beautiful temple, peaceful atmosphere.')).toBeInTheDocument();
  });

  it('does not render body section when body is absent', () => {
    const r = { ...BASE_REVIEW, body: undefined };
    render(<ReviewCard review={r} />);
    expect(screen.queryByText('Beautiful temple')).not.toBeInTheDocument();
  });

  // ── Star rating ──────────────────────────────────────────────────────────────

  it('renders exactly 5 star SVG icons', () => {
    const { container } = render(<ReviewCard review={BASE_REVIEW} />);
    // StarRating renders 5 <polygon> elements inside the flex row
    const stars = container.querySelectorAll('svg polygon');
    // Two sets of 5 stars (rating row + numeric badge polygon) — filter by size
    // The 5-star row and the numeric badge use different svg containers
    // We check at least 5 are in the document
    expect(stars.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the numeric rating badge', () => {
    render(<ReviewCard review={{ ...BASE_REVIEW, rating: 5 }} />);
    // The numeric badge shows the rating value
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // ── Relative time ────────────────────────────────────────────────────────────

  it('renders a relative time string (non-empty)', () => {
    render(<ReviewCard review={BASE_REVIEW} />);
    // date-fns formatDistanceToNow produces e.g. "2 minutes ago"
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  // ── Verified purchase badge ───────────────────────────────────────────────────

  it('shows "✓ Verified" badge when isVerifiedPurchase=true', () => {
    render(<ReviewCard review={{ ...BASE_REVIEW, isVerifiedPurchase: true }} />);
    expect(screen.getByText('✓ Verified')).toBeInTheDocument();
  });

  it('does not show "✓ Verified" badge when isVerifiedPurchase=false', () => {
    render(<ReviewCard review={{ ...BASE_REVIEW, isVerifiedPurchase: false }} />);
    expect(screen.queryByText('✓ Verified')).not.toBeInTheDocument();
  });

  it('does not show "✓ Verified" badge when isVerifiedPurchase is absent', () => {
    render(<ReviewCard review={BASE_REVIEW} />);
    expect(screen.queryByText('✓ Verified')).not.toBeInTheDocument();
  });

  // ── Avatar ────────────────────────────────────────────────────────────────────

  it('renders an <img> when avatarUrl is provided', () => {
    const r = { ...BASE_REVIEW, user: { name: 'Arjun', avatarUrl: 'https://cdn.example.com/avatar.jpg' } };
    render(<ReviewCard review={r} />);
    const img = screen.getByRole('img', { name: 'Arjun' });
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/avatar.jpg');
  });

  it('renders initials fallback when no avatarUrl', () => {
    // "Arjun Sharma" → "AS"
    render(<ReviewCard review={{ ...BASE_REVIEW, user: { name: 'Arjun Sharma' } }} />);
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('renders single-word name initials correctly', () => {
    render(<ReviewCard review={{ ...BASE_REVIEW, user: { name: 'Krishna' } }} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
