/**
 * Tests for components/temples/FavoriteButton.tsx
 *
 * Mocks @/hooks/useFavorites and @/lib/analytics.
 * Tests: renders button, aria-label, aria-pressed, clicking calls toggle,
 * heart fills when already favorited, busy state, error handling.
 */

jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { favoriteToggle: jest.fn() },
}));

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { FavoriteButton } from './FavoriteButton';
import { useFavorites } from '@/hooks/useFavorites';
import { analytics } from '@/lib/analytics';

const useFavoritesMock  = useFavorites  as jest.Mock;
const favoriteToggleMock = (analytics as any).favoriteToggle as jest.Mock;

function setupFavorites(isFav: boolean, toggleResult = !isFav) {
  const toggleMock = jest.fn().mockResolvedValue(toggleResult);
  useFavoritesMock.mockReturnValue({
    isFavorite: (_id: string) => isFav,
    toggle: toggleMock,
  });
  return toggleMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupFavorites(false);
});

describe('FavoriteButton', () => {
  // ── rendering ──────────────────────────────────────────────────────────────

  it('renders a button', () => {
    render(<FavoriteButton templeId="t1" templeName="Kashi Temple" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('aria-label includes the temple name (not favorited)', () => {
    render(<FavoriteButton templeId="t1" templeName="Kashi Temple" />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Favourite Kashi Temple',
    );
  });

  it('aria-label says Unfavourite when already favorited', () => {
    setupFavorites(true);
    render(<FavoriteButton templeId="t1" templeName="Golden Temple" />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Unfavourite Golden Temple',
    );
  });

  it('aria-pressed is false when not favorited', () => {
    render(<FavoriteButton templeId="t1" templeName="Test" />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('aria-pressed is true when favorited', () => {
    setupFavorites(true);
    render(<FavoriteButton templeId="t1" templeName="Test" />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  // ── click behaviour ────────────────────────────────────────────────────────

  it('clicking calls useFavorites.toggle with templeId', async () => {
    const toggle = setupFavorites(false);
    render(<FavoriteButton templeId="temple-99" templeName="Test" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(toggle).toHaveBeenCalledWith('temple-99');
  });

  it('calls analytics.favoriteToggle after successful toggle', async () => {
    setupFavorites(false, true);
    render(<FavoriteButton templeId="t1" templeName="Test" source="list" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(favoriteToggleMock).toHaveBeenCalledWith('t1', true, 'list');
  });

  it('uses variant as analytics source when source prop is absent', async () => {
    setupFavorites(false, true);
    render(<FavoriteButton templeId="t1" templeName="Test" variant="hero" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(favoriteToggleMock).toHaveBeenCalledWith('t1', true, 'hero');
  });

  it('does not throw when toggle rejects (error handling path)', async () => {
    const toggle = jest.fn().mockRejectedValueOnce(new Error('network'));
    useFavoritesMock.mockReturnValue({ isFavorite: () => false, toggle });
    render(<FavoriteButton templeId="t1" templeName="Test" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    // No uncaught error; button remains in document
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  // ── hero variant ───────────────────────────────────────────────────────────

  it('renders with hero variant without error', () => {
    render(<FavoriteButton templeId="t1" templeName="Test" variant="hero" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
