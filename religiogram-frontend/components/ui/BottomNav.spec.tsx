/**
 * Tests for components/ui/BottomNav.tsx
 *
 * next/navigation and next/link are handled by the jest moduleNameMapper
 * pointing to __mocks__/next_navigation.js and __mocks__/next_link.js.
 * usePathname is a jest.fn() so we can call mockReturnValue per test.
 *
 * Active-state is verified via the label <span> fontWeight:
 *   active  → 600
 *   inactive → 400
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('@/lib/notifications-api', () => ({
  getUnreadCount: jest.fn(),
}));

import BottomNav from './BottomNav';
import { usePathname } from 'next/navigation';
import { getUnreadCount } from '@/lib/notifications-api';

const mockUsePathname    = usePathname    as jest.Mock;
const getUnreadCountMock = getUnreadCount as jest.Mock;

async function renderNav(pathname = '/home') {
  mockUsePathname.mockReturnValue(pathname);
  let result: ReturnType<typeof render> = undefined as any;
  await act(async () => { result = render(<BottomNav />); });
  return result;
}

/** Active label has fontWeight '600'; inactive has '400'. */
function labelFontWeight(labelText: string): string {
  return (screen.getByText(labelText) as HTMLElement).style.fontWeight;
}

describe('BottomNav', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/home');
    getUnreadCountMock.mockResolvedValue(0);
  });

  // ── 5 nav items ───────────────────────────────────────────────────────────

  it('renders all 5 navigation labels', async () => {
    await renderNav();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Priests')).toBeInTheDocument();
    expect(screen.getByText('Holy Places')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders exactly 5 nav links', async () => {
    await renderNav();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('renders a <nav> element', async () => {
    await renderNav();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // ── href values ───────────────────────────────────────────────────────────

  it('Home link points to /home', async () => {
    await renderNav();
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/home');
  });

  it('Priests link points to /priests', async () => {
    await renderNav();
    expect(screen.getByText('Priests').closest('a')).toHaveAttribute('href', '/priests');
  });

  it('Holy Places link points to /places', async () => {
    await renderNav();
    expect(screen.getByText('Holy Places').closest('a')).toHaveAttribute('href', '/places');
  });

  it('Community link points to /social', async () => {
    await renderNav();
    expect(screen.getByText('Community').closest('a')).toHaveAttribute('href', '/social');
  });

  it('Profile link points to /profile', async () => {
    await renderNav();
    expect(screen.getByText('Profile').closest('a')).toHaveAttribute('href', '/profile');
  });

  // ── Active state (fontWeight: '600' = active, '400' = inactive) ───────────

  it('Home label is bold (fontWeight 600) on /home', async () => {
    await renderNav('/home');
    expect(labelFontWeight('Home')).toBe('600');
  });

  it('Home label is normal (fontWeight 400) on /social', async () => {
    await renderNav('/social');
    expect(labelFontWeight('Home')).toBe('400');
  });

  it('Priests label is bold on /priests', async () => {
    await renderNav('/priests');
    expect(labelFontWeight('Priests')).toBe('600');
  });

  it('Priests label is bold on /book/123 (multi-path match)', async () => {
    await renderNav('/book/123');
    expect(labelFontWeight('Priests')).toBe('600');
  });

  it('Priests label is bold on /consult', async () => {
    await renderNav('/consult');
    expect(labelFontWeight('Priests')).toBe('600');
  });

  it('Holy Places label is bold on /places', async () => {
    await renderNav('/places');
    expect(labelFontWeight('Holy Places')).toBe('600');
  });

  it('Holy Places label is bold on /temple/kashi', async () => {
    await renderNav('/temple/kashi');
    expect(labelFontWeight('Holy Places')).toBe('600');
  });

  it('Community label is bold on /social', async () => {
    await renderNav('/social');
    expect(labelFontWeight('Community')).toBe('600');
  });

  it('Profile label is bold on /profile', async () => {
    await renderNav('/profile');
    expect(labelFontWeight('Profile')).toBe('600');
  });

  it('Profile label is normal (fontWeight 400) on /home', async () => {
    await renderNav('/home');
    expect(labelFontWeight('Profile')).toBe('400');
  });

  // ── Unread badge ──────────────────────────────────────────────────────────

  it('shows numeric badge on Profile when unreadCount > 0', async () => {
    localStorage.setItem('rg_access_token', 'test-tok');
    getUnreadCountMock.mockResolvedValue(3);
    await act(async () => { render(<BottomNav />); });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does NOT show numeric badge when unreadCount is 0', async () => {
    getUnreadCountMock.mockResolvedValue(0);
    await renderNav('/home');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('does NOT call getUnreadCount when no token in localStorage', async () => {
    localStorage.removeItem('rg_access_token');
    getUnreadCountMock.mockResolvedValue(5);
    await act(async () => { render(<BottomNav />); });
    expect(getUnreadCountMock).not.toHaveBeenCalled();
  });

  it('calls getUnreadCount with the stored token', async () => {
    localStorage.setItem('rg_access_token', 'my-token');
    getUnreadCountMock.mockResolvedValue(0);
    await act(async () => { render(<BottomNav />); });
    expect(getUnreadCountMock).toHaveBeenCalledWith('my-token');
  });
});
