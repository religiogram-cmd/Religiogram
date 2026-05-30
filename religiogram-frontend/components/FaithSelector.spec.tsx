/**
 * Tests for components/FaithSelector.tsx
 *
 * FaithSelector reads + writes ThemeContext. We wrap it in the real
 * ThemeProvider so the full context lifecycle is exercised.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { FaithSelector } from './FaithSelector';
import { FAITH_THEMES } from '@/lib/faith-themes';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const ALL_SLUGS = Object.keys(FAITH_THEMES) as Array<keyof typeof FAITH_THEMES>;

describe('FaithSelector', () => {
  beforeEach(() => { localStorage.clear(); });

  // ── Rendering ────────────────────────────────────────────────────────────────

  it('renders a pill for every FAITH_THEMES entry', () => {
    renderWithTheme(<FaithSelector />);
    // Each theme has a label property — verify all labels appear
    ALL_SLUGS.forEach((slug) => {
      expect(screen.getByText(FAITH_THEMES[slug].label)).toBeInTheDocument();
    });
  });

  it('renders exactly 5 faith pills', () => {
    renderWithTheme(<FaithSelector />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(ALL_SLUGS.length);
  });

  it('renders the icon for every faith', () => {
    renderWithTheme(<FaithSelector />);
    ALL_SLUGS.forEach((slug) => {
      expect(screen.getByText(FAITH_THEMES[slug].icon)).toBeInTheDocument();
    });
  });

  // ── Active state ─────────────────────────────────────────────────────────────

  it('the "universal" pill is active by default (no localStorage)', () => {
    renderWithTheme(<FaithSelector />);
    const universalBtn = screen.getByText(FAITH_THEMES.universal.label).closest('button')!;
    // Active pill has a non-transparent background (the primary colour)
    expect(universalBtn.style.background).not.toBe('transparent');
    expect(universalBtn.style.background).not.toBe('');
  });

  it('inactive pills have transparent background', () => {
    renderWithTheme(<FaithSelector />);
    // All pills other than "universal" should start as transparent
    const hinduBtn = screen.getByText(FAITH_THEMES.hindu.label).closest('button')!;
    expect(hinduBtn.style.background).toBe('transparent');
  });

  // ── Interaction ───────────────────────────────────────────────────────────────

  it('clicking a pill makes it the active one', () => {
    renderWithTheme(<FaithSelector />);
    const hinduBtn = screen.getByText(FAITH_THEMES.hindu.label).closest('button')!;

    fireEvent.click(hinduBtn);

    // After click, hinduBtn should have a non-transparent background
    expect(hinduBtn.style.background).not.toBe('transparent');
  });

  it('clicking a pill deactivates the previous active pill', () => {
    renderWithTheme(<FaithSelector />);
    const universalBtn = screen.getByText(FAITH_THEMES.universal.label).closest('button')!;
    const hinduBtn = screen.getByText(FAITH_THEMES.hindu.label).closest('button')!;

    fireEvent.click(hinduBtn);

    // "universal" should now be inactive (transparent)
    expect(universalBtn.style.background).toBe('transparent');
  });

  it('persists the selection to localStorage', () => {
    renderWithTheme(<FaithSelector />);
    const islamBtn = screen.getByText(FAITH_THEMES.islam.label).closest('button')!;
    fireEvent.click(islamBtn);
    expect(localStorage.getItem('rg_faith_slug')).toBe('islam');
  });

  it('can switch between all faith slugs without error', () => {
    renderWithTheme(<FaithSelector />);
    ALL_SLUGS.forEach((slug) => {
      const btn = screen.getByText(FAITH_THEMES[slug].label).closest('button')!;
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  // ── Active pill styling ──────────────────────────────────────────────────────

  it('active pill has bold font weight', () => {
    renderWithTheme(<FaithSelector />);
    const universalBtn = screen.getByText(FAITH_THEMES.universal.label).closest('button')!;
    expect(universalBtn.style.fontWeight).toBe('600');
  });

  it('inactive pill has normal font weight', () => {
    renderWithTheme(<FaithSelector />);
    const hinduBtn = screen.getByText(FAITH_THEMES.hindu.label).closest('button')!;
    expect(hinduBtn.style.fontWeight).toBe('400');
  });
});
