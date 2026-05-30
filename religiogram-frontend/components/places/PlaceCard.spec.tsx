/**
 * Tests for components/places/PlaceCard.tsx
 *
 * Pure presentational component — link + render from props.
 * next/link is stubbed to a plain <a> in __mocks__/next_link.js.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlaceCard, type PlaceCardData } from './PlaceCard';

function makePlace(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    id: 'p-1',
    name: 'Kashi Vishwanath Temple',
    type: 'temple',
    rating: 4.7,
    reviewCount: 12000,
    services: ['Aarti', 'Darshan', 'Prasad', 'Photography'],
    isVerified: true,
    isOpen: true,
    coverGradient: ['#FF6B00', '#FF8C42'],
    icon: '🛕',
    ...overrides,
  };
}

describe('PlaceCard', () => {
  // ── Link / navigation ────────────────────────────────────────────────────────

  it('wraps the card in a link pointing to /places/:id', () => {
    render(<PlaceCard place={makePlace({ id: 'kashi-1' })} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/places/kashi-1');
  });

  // ── Name ─────────────────────────────────────────────────────────────────────

  it('renders the place name', () => {
    render(<PlaceCard place={makePlace({ name: 'Lotus Temple' })} />);
    expect(screen.getByText('Lotus Temple')).toBeInTheDocument();
  });

  // ── Faith type pill ──────────────────────────────────────────────────────────

  it('displays "Temple" pill for type="temple"', () => {
    render(<PlaceCard place={makePlace({ type: 'temple' })} />);
    expect(screen.getByText('Temple')).toBeInTheDocument();
  });

  it('displays "Mosque" pill for type="mosque"', () => {
    render(<PlaceCard place={makePlace({ type: 'mosque', icon: '🕌' })} />);
    expect(screen.getByText('Mosque')).toBeInTheDocument();
  });

  it('displays "Church" pill for type="church"', () => {
    render(<PlaceCard place={makePlace({ type: 'church', icon: '⛪' })} />);
    expect(screen.getByText('Church')).toBeInTheDocument();
  });

  // ── Open / Closed badge ──────────────────────────────────────────────────────

  it('shows "● Open" badge when isOpen=true', () => {
    render(<PlaceCard place={makePlace({ isOpen: true })} />);
    expect(screen.getByText('● Open')).toBeInTheDocument();
  });

  it('shows "○ Closed" badge when isOpen=false', () => {
    render(<PlaceCard place={makePlace({ isOpen: false })} />);
    expect(screen.getByText('○ Closed')).toBeInTheDocument();
  });

  // ── Distance pill ────────────────────────────────────────────────────────────

  it('renders distance pill when distance is provided', () => {
    render(<PlaceCard place={makePlace({ distance: '2.3 km' })} />);
    expect(screen.getByText('2.3 km')).toBeInTheDocument();
  });

  it('does not render distance pill when distance is undefined', () => {
    render(<PlaceCard place={makePlace({ distance: undefined })} />);
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });

  // ── Verified badge ───────────────────────────────────────────────────────────

  it('shows "Verified" badge when isVerified=true', () => {
    render(<PlaceCard place={makePlace({ isVerified: true })} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('does not show "Verified" badge when isVerified=false', () => {
    render(<PlaceCard place={makePlace({ isVerified: false })} />);
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  // ── Rating ───────────────────────────────────────────────────────────────────

  it('renders the numeric rating', () => {
    render(<PlaceCard place={makePlace({ rating: 4.7 })} />);
    expect(screen.getByText('4.7')).toBeInTheDocument();
  });

  // ── Review count ─────────────────────────────────────────────────────────────

  it('formats reviewCount as abbreviated "(n.nk)"', () => {
    // 12000 → "12.0k"
    render(<PlaceCard place={makePlace({ reviewCount: 12000 })} />);
    expect(screen.getByText('(12.0k)')).toBeInTheDocument();
  });

  // ── Services chips ───────────────────────────────────────────────────────────

  it('renders up to 3 service chips', () => {
    render(<PlaceCard place={makePlace({ services: ['Aarti', 'Darshan', 'Prasad', 'Photography'] })} />);
    expect(screen.getByText('Aarti')).toBeInTheDocument();
    expect(screen.getByText('Darshan')).toBeInTheDocument();
    expect(screen.getByText('Prasad')).toBeInTheDocument();
    // 4th item should not appear
    expect(screen.queryByText('Photography')).not.toBeInTheDocument();
  });

  it('renders all service chips when there are fewer than 3', () => {
    render(<PlaceCard place={makePlace({ services: ['Aarti', 'Darshan'] })} />);
    expect(screen.getByText('Aarti')).toBeInTheDocument();
    expect(screen.getByText('Darshan')).toBeInTheDocument();
  });

  // ── Icon ─────────────────────────────────────────────────────────────────────

  it('renders the place icon emoji', () => {
    render(<PlaceCard place={makePlace({ icon: '🕌' })} />);
    expect(screen.getByText('🕌')).toBeInTheDocument();
  });
});
