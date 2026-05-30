/**
 * Tests for hooks/useTheme.ts (re-export of contexts/ThemeContext.tsx)
 *
 * ThemeProvider wraps children; useTheme() exposes { theme, faithSlug, setFaith }.
 * CSS variable writes go to document.documentElement.style — verified via getPropertyValue.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { FAITH_THEMES } from '@/lib/faith-themes';

// ── Harness ────────────────────────────────────────────────────────────────────

function Harness({ onMount }: { onMount: (api: ReturnType<typeof useTheme>) => void }) {
  const api = useTheme();
  React.useEffect(() => { onMount(api); }, []);
  return (
    <div>
      <span data-testid="slug">{api.faithSlug}</span>
      <span data-testid="primary">{api.theme.primary}</span>
    </div>
  );
}

function wrap(onMount: (api: ReturnType<typeof useTheme>) => void) {
  return (
    <ThemeProvider>
      <Harness onMount={onMount} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  // Reset CSS variables between tests
  document.documentElement.removeAttribute('style');
});

describe('useTheme / ThemeProvider', () => {
  // ── initial state ──────────────────────────────────────────────────────────

  it('defaults to universal faith slug', async () => {
    await act(async () => { render(wrap(() => {})); });
    expect(screen.getByTestId('slug').textContent).toBe('universal');
  });

  it('initial theme is the universal theme object', async () => {
    await act(async () => { render(wrap(() => {})); });
    expect(screen.getByTestId('primary').textContent).toBe(FAITH_THEMES.universal.primary);
  });

  it('hydrates faithSlug from localStorage', async () => {
    localStorage.setItem('rg_faith_slug', 'hindu');
    await act(async () => { render(wrap(() => {})); });
    expect(screen.getByTestId('slug').textContent).toBe('hindu');
  });

  // ── setFaith() ────────────────────────────────────────────────────────────

  it('setFaith() updates the slug and theme', async () => {
    let api!: ReturnType<typeof useTheme>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.setFaith('sikhism'); });
    expect(screen.getByTestId('slug').textContent).toBe('sikhism');
    expect(screen.getByTestId('primary').textContent).toBe(FAITH_THEMES.sikhism.primary);
  });

  it('setFaith() persists the slug to localStorage', async () => {
    let api!: ReturnType<typeof useTheme>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.setFaith('islam'); });
    expect(localStorage.getItem('rg_faith_slug')).toBe('islam');
  });

  // ── CSS variable injection ────────────────────────────────────────────────

  it('sets --color-primary CSS variable on <html>', async () => {
    await act(async () => { render(wrap(() => {})); });
    const val = document.documentElement.style.getPropertyValue('--color-primary');
    expect(val).toBe(FAITH_THEMES.universal.primary);
  });

  it('updates --color-primary after setFaith', async () => {
    let api!: ReturnType<typeof useTheme>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.setFaith('christianity'); });
    const val = document.documentElement.style.getPropertyValue('--color-primary');
    expect(val).toBe(FAITH_THEMES.christianity.primary);
  });

  // ── throws without Provider ───────────────────────────────────────────────

  it('does not throw when used inside ThemeProvider', async () => {
    expect(() => render(wrap(() => {}))).not.toThrow();
  });
});
