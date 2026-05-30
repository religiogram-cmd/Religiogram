/**
 * Tests for lib/useReligion.ts
 *
 * useReligion hook: religion state, confirmReligion, resetReligion,
 * loaded flag, localStorage persistence.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useReligion, UserReligion } from './useReligion';

// Helper component — renders hook output as text nodes
function Harness({ onMount }: { onMount: (api: ReturnType<typeof useReligion>) => void }) {
  const api = useReligion();
  React.useEffect(() => { onMount(api); }, []);
  return (
    <div>
      <span data-testid="religion">{api.religion ?? 'null'}</span>
      <span data-testid="loaded">{String(api.loaded)}</span>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('useReligion', () => {
  // ── initial state ──────────────────────────────────────────────────────────

  it('religion is null initially when nothing stored', async () => {
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('religion').textContent).toBe('null');
  });

  it('loaded is true after mount', async () => {
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('loaded').textContent).toBe('true');
  });

  it('reads stored religion from localStorage on mount', async () => {
    localStorage.setItem('rg_user_religion', 'hindu');
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('religion').textContent).toBe('hindu');
  });

  // ── confirmReligion ────────────────────────────────────────────────────────

  it('confirmReligion updates the religion state', async () => {
    let api!: ReturnType<typeof useReligion>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.confirmReligion('sikh'); });
    expect(screen.getByTestId('religion').textContent).toBe('sikh');
  });

  it('confirmReligion writes to localStorage', async () => {
    let api!: ReturnType<typeof useReligion>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.confirmReligion('muslim'); });
    expect(localStorage.getItem('rg_user_religion')).toBe('muslim');
  });

  it('confirmReligion accepts all valid UserReligion values', async () => {
    const values: UserReligion[] = ['all', 'hindu', 'muslim', 'sikh', 'christian'];
    for (const v of values) {
      localStorage.clear();
      let api!: ReturnType<typeof useReligion>;
      await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
      await act(async () => { api.confirmReligion(v); });
      expect(localStorage.getItem('rg_user_religion')).toBe(v);
    }
  });

  // ── resetReligion ──────────────────────────────────────────────────────────

  it('resetReligion sets religion back to null', async () => {
    localStorage.setItem('rg_user_religion', 'christian');
    let api!: ReturnType<typeof useReligion>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.resetReligion(); });
    expect(screen.getByTestId('religion').textContent).toBe('null');
  });

  it('resetReligion removes key from localStorage', async () => {
    localStorage.setItem('rg_user_religion', 'hindu');
    let api!: ReturnType<typeof useReligion>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.resetReligion(); });
    expect(localStorage.getItem('rg_user_religion')).toBeNull();
  });
});
