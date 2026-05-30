/**
 * Tests for components/temples/TempleCard.tsx
 *
 * Mocks: @/hooks/useFavorites, @/lib/analytics, @/lib/api (for TempleFollowButton).
 * next/image and next/link are mocked in jest.config.js.
 */

jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: jest.fn().mockReturnValue({
    isFavorite: () => false,
    toggle: jest.fn().mockResolvedValue(false),
  }),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { favoriteToggle: jest.fn() },
}));

jest.mock('@/lib/api', () => ({
  followsApi: {
    myFollowing: jest.fn().mockResolvedValue({ items: [] }),
    follow:   jest.fn().mockResolvedValue({ id: 'f1' }),
    unfollow: jest.fn().mockResolvedValue(undefined),
  },
  ApiError: class ApiError extends Error {},
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TempleCard } from './TempleCard';
import type { Temple } from '@/lib/temples-api';

function makeTemple(overrides: Partial<Temple> = {}): Temple {
  return {
    id:           'temple-1',
    name:         'Kashi Vishwanath',
    city:         'Varanasi',
    state:        'Uttar Pradesh',
    address:      'Lahori Tola, Varanasi',
    lat:          25.31,
    lng:          83.01,
    ratingAvg:    4.7,
    ratingCount:  382,
    hours:        '6am–9pm',
    deity:        'Shiva',
    isVerified:   true,
    imageUrl:     null,
    ...overrides,
  };
}

describe('TempleCard', () => {
  // ── content ────────────────────────────────────────────────────────────────

  it('renders the temple name', () => {
    render(<TempleCard temple={makeTemple()} />);
    expect(screen.getByText('Kashi Vishwanath')).toBeInTheDocument();
  });

  it('renders a link to /temple/:id', () => {
    render(<TempleCard temple={makeTemple({ id: 'temple-42' })} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/temple/temple-42');
  });

  it('renders address when present', () => {
    render(<TempleCard temple={makeTemple()} />);
    expect(screen.getByText(/Lahori Tola/)).toBeInTheDocument();
  });

  it('renders deity chip when deity is set', () => {
    render(<TempleCard temple={makeTemple({ deity: 'Shiva' })} />);
    expect(screen.getByText('Shiva')).toBeInTheDocument();
  });

  it('does not render deity chip when deity is null', () => {
    render(<TempleCard temple={makeTemple({ deity: null })} />);
    expect(screen.queryByText('Shiva')).not.toBeInTheDocument();
  });

  // ── rating ─────────────────────────────────────────────────────────────────

  it('shows formatted ratingAvg when ratings exist', () => {
    render(<TempleCard temple={makeTemple({ ratingAvg: 4.7, ratingCount: 100 })} />);
    expect(screen.getByText('4.7')).toBeInTheDocument();
  });

  it('shows "No reviews yet" when ratingCount is 0', () => {
    render(<TempleCard temple={makeTemple({ ratingAvg: null, ratingCount: 0 })} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });

  // ── distance ───────────────────────────────────────────────────────────────

  it('shows distance in km when distanceM >= 1000', () => {
    render(<TempleCard temple={makeTemple({ distanceM: 2300 })} />);
    expect(screen.getByText('2.3 km')).toBeInTheDocument();
  });

  it('shows distance in m when distanceM < 1000', () => {
    render(<TempleCard temple={makeTemple({ distanceM: 450 })} />);
    expect(screen.getByText('450 m')).toBeInTheDocument();
  });

  it('hides distance when distanceM is undefined', () => {
    render(<TempleCard temple={makeTemple({ distanceM: undefined })} />);
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ m$/)).not.toBeInTheDocument();
  });

  // ── image / fallback ───────────────────────────────────────────────────────

  it('renders a temple emoji fallback when imageUrl is null', () => {
    render(<TempleCard temple={makeTemple({ imageUrl: null })} />);
    expect(screen.getByText('🛕')).toBeInTheDocument();
  });

  it('renders img tag when imageUrl is provided', () => {
    const { container } = render(
      <TempleCard temple={makeTemple({ imageUrl: 'https://cdn.example.com/temple.jpg' })} />,
    );
    const img = container.querySelector('img[src="https://cdn.example.com/temple.jpg"]') as HTMLImageElement;
    expect(img).not.toBeNull();
  });

  // ── verified badge ─────────────────────────────────────────────────────────

  it('renders verified badge when isVerified is true', () => {
    render(<TempleCard temple={makeTemple({ isVerified: true })} />);
    // Badge has aria-label="Verified"
    const badge = screen.getByLabelText('Verified');
    expect(badge).toBeInTheDocument();
  });

  it('does not render verified badge when isVerified is false', () => {
    render(<TempleCard temple={makeTemple({ isVerified: false })} />);
    expect(screen.queryByLabelText('Verified')).not.toBeInTheDocument();
  });

  // ── callbacks ──────────────────────────────────────────────────────────────

  it('calls onClick with templeId when card link is clicked', () => {
    const onClick = jest.fn();
    render(<TempleCard temple={makeTemple({ id: 't-click' })} onClick={onClick} />);
    screen.getByRole('link').click();
    expect(onClick).toHaveBeenCalledWith('t-click');
  });
});
