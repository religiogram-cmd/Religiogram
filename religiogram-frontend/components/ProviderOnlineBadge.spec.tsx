/**
 * Tests for components/ProviderOnlineBadge.tsx
 *
 * Pure presentational component — no context, no network.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProviderOnlineBadge } from './ProviderOnlineBadge';

describe('ProviderOnlineBadge', () => {
  // ── aria-label ──────────────────────────────────────────────────────────────

  it('has aria-label "Online now" when isOnline=true', () => {
    render(<ProviderOnlineBadge isOnline={true} />);
    expect(screen.getByLabelText('Online now')).toBeInTheDocument();
  });

  it('has aria-label "Offline" when isOnline=false', () => {
    render(<ProviderOnlineBadge isOnline={false} />);
    expect(screen.getByLabelText('Offline')).toBeInTheDocument();
  });

  // ── dot colour ──────────────────────────────────────────────────────────────

  it('dot is green (#27AE60) when online', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={true} />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.background).toBe('rgb(39, 174, 96)');  // jsdom normalises hex→rgb
  });

  it('dot is grey (#B0B0B0) when offline', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={false} />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.background).toBe('rgb(176, 176, 176)');  // jsdom normalises hex→rgb
  });

  // ── label text ──────────────────────────────────────────────────────────────

  it('does not render label text by default (showLabel defaults to false)', () => {
    render(<ProviderOnlineBadge isOnline={true} />);
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('renders "Online" text when showLabel=true and isOnline=true', () => {
    render(<ProviderOnlineBadge isOnline={true} showLabel={true} />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders "Offline" text when showLabel=true and isOnline=false', () => {
    render(<ProviderOnlineBadge isOnline={false} showLabel={true} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  // ── size ────────────────────────────────────────────────────────────────────

  it('dot is 10px for size="md" (default)', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={true} />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.width).toBe('10px');
    expect(dot.style.height).toBe('10px');
  });

  it('dot is 8px for size="sm"', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={true} size="sm" />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.width).toBe('8px');
    expect(dot.style.height).toBe('8px');
  });

  // ── online glow ─────────────────────────────────────────────────────────────

  it('online dot has a coloured box-shadow', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={true} />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.boxShadow).toContain('rgba(39,174,96,0.25)');
  });

  it('offline dot has no box-shadow', () => {
    const { container } = render(<ProviderOnlineBadge isOnline={false} />);
    const dot = container.querySelector('span > span') as HTMLElement;
    expect(dot.style.boxShadow).toBe('none');
  });
});
