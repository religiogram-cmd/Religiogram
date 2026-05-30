/**
 * Tests for components/temples/TempleFollowButton.tsx
 *
 * followsApi is fully mocked so no network calls are made.
 * The component is self-contained: it loads its own follow state on mount
 * via followsApi.myFollowing(), then toggles via follow()/unfollow().
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  followsApi: {
    myFollowing: jest.fn(),
    follow:      jest.fn(),
    unfollow:    jest.fn(),
  },
}));

import { TempleFollowButton } from './TempleFollowButton';
import { followsApi } from '@/lib/api';

const myFollowingMock = followsApi.myFollowing as jest.Mock;
const followMock      = followsApi.follow      as jest.Mock;
const unfollowMock    = followsApi.unfollow    as jest.Mock;

function makeFollow(templeId: string, followId = 'f-1') {
  return {
    id: followId,
    followerId: 'u-1',
    followeeType: 'temple' as const,
    followeeId: templeId,
    createdAt: new Date().toISOString(),
  };
}

describe('TempleFollowButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    myFollowingMock.mockResolvedValue({ items: [] });
    followMock.mockResolvedValue(makeFollow('t-1'));
    unfollowMock.mockResolvedValue({ success: true });
  });

  // ── Loading state ──────────────────────────────────────────────────────

  it('shows "…" while loading', async () => {
    // Never resolves during this test
    myFollowingMock.mockReturnValue(new Promise(() => {}));
    render(<TempleFollowButton templeId="t-1" />);
    expect(screen.getByRole('button').textContent).toBe('…');
  });

  it('button is disabled while loading', async () => {
    myFollowingMock.mockReturnValue(new Promise(() => {}));
    render(<TempleFollowButton templeId="t-1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  // ── Not following ──────────────────────────────────────────────────────

  it('shows "+ Follow" when not following', async () => {
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('+ Follow'));
  });

  it('aria-label is "Follow temple" when not following', async () => {
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Follow temple'),
    );
  });

  it('button is enabled after loading (not following)', async () => {
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });

  // ── Already following ──────────────────────────────────────────────────

  it('shows "Following" when already following', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('t-1', 'f-existing')] });
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('Following'));
  });

  it('aria-label is "Unfollow temple" when already following', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('t-1', 'f-existing')] });
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Unfollow temple'),
    );
  });

  it('ignores follows for different templeId when checking follow state', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('other-temple', 'f-2')] });
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('+ Follow'));
  });

  // ── Follow action ──────────────────────────────────────────────────────

  it('calls followsApi.follow with type "temple" and templeId on click', async () => {
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('+ Follow'));
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(followMock).toHaveBeenCalledWith('temple', 't-1');
  });

  it('shows "Following" after successful follow', async () => {
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === '+ Follow');
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('Following'));
  });

  // ── Unfollow action ────────────────────────────────────────────────────

  it('calls followsApi.unfollow with follow id on click when following', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('t-1', 'f-existing')] });
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === 'Following');
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(unfollowMock).toHaveBeenCalledWith('f-existing');
  });

  it('shows "+ Follow" after successful unfollow', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('t-1', 'f-existing')] });
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === 'Following');
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('+ Follow'));
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('silently recovers when follow API throws', async () => {
    followMock.mockRejectedValueOnce(new Error('network'));
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === '+ Follow');
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    // Button should not remain "…" indefinitely
    await waitFor(() => expect(screen.getByRole('button').textContent).not.toBe('…'));
  });

  it('silently recovers when unfollow API throws', async () => {
    myFollowingMock.mockResolvedValue({ items: [makeFollow('t-1', 'f-existing')] });
    unfollowMock.mockRejectedValueOnce(new Error('network'));
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === 'Following');
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    await waitFor(() => expect(screen.getByRole('button').textContent).not.toBe('…'));
  });

  // ── Guard: no double-click during toggle ───────────────────────────────

  it('does not fire a second follow call if already toggling', async () => {
    let resolveFollow!: (v: any) => void;
    followMock.mockReturnValueOnce(new Promise((res) => { resolveFollow = res; }));
    await act(async () => { render(<TempleFollowButton templeId="t-1" />); });
    await waitFor(() => screen.getByRole('button').textContent === '+ Follow');
    // First click starts the toggle (button becomes disabled/"…")
    fireEvent.click(screen.getByRole('button'));
    // Second click while toggling — should be ignored
    fireEvent.click(screen.getByRole('button'));
    resolveFollow(makeFollow('t-1'));
    await act(async () => {});
    expect(followMock).toHaveBeenCalledTimes(1);
  });
});
