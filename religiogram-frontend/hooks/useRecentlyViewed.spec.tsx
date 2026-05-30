/**
 * Tests for hooks/useRecentlyViewed.ts
 *
 * Uses localStorage (jsdom provides it).
 * Tests: initial state, record(), dedup, MAX_ITEMS cap, remove(), clear(),
 * hydration flag, and data persistence.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useRecentlyViewed } from './useRecentlyViewed';
import type { Temple } from '@/lib/temples-api';

const STORAGE_KEY = 'religiogram.recentTemples.v1';

function makeTemple(id: string, name = `Temple ${id}`): Temple {
  return {
    id,
    name,
    city: 'Delhi',
    state: null,
    address: null,
    lat: 28.6,
    lng: 77.2,
    ratingAvg: null,
    ratingCount: 0,
    hours: null,
    deity: null,
    isVerified: false,
    imageUrl: null,
  };
}

// ── Harness ────────────────────────────────────────────────────────────────────

function Harness({ onMount }: { onMount: (api: ReturnType<typeof useRecentlyViewed>) => void }) {
  const api = useRecentlyViewed();
  React.useEffect(() => { onMount(api); }, []);
  return (
    <div>
      <span data-testid="count">{api.items.length}</span>
      <span data-testid="hydrated">{String(api.isHydrated)}</span>
      {api.items.map(i => (
        <span key={i.id} data-testid={`item-${i.id}`}>{i.name}</span>
      ))}
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('useRecentlyViewed', () => {
  // ── initial / hydration ──────────────────────────────────────────────────────

  it('items is empty initially when localStorage is empty', async () => {
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('isHydrated is true after mount', async () => {
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('hydrated').textContent).toBe('true');
  });

  it('reads existing items from localStorage on mount', async () => {
    const stored = [{ id: 'a', name: 'Temple A', city: 'Delhi', imageUrl: null, viewedAt: Date.now() }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    await act(async () => { render(<Harness onMount={() => {}} />); });
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('item-a').textContent).toBe('Temple A');
  });

  // ── record() ──────────────────────────────────────────────────────────────────

  it('record() adds a temple to items', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); });
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('item-t1')).toBeInTheDocument();
  });

  it('record() persists to localStorage', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t2')); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored[0].id).toBe('t2');
  });

  it('record() deduplicates: re-viewing moves temple to top', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); });
    await act(async () => { api.record(makeTemple('t2')); });
    await act(async () => { api.record(makeTemple('t1')); }); // revisit t1
    // t1 should be first, t2 second, count = 2
    expect(screen.getByTestId('count').textContent).toBe('2');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored[0].id).toBe('t1');
  });

  it('record() caps list at 10 entries', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    for (let i = 1; i <= 12; i++) {
      await act(async () => { api.record(makeTemple(`t${i}`)); });
    }
    expect(screen.getByTestId('count').textContent).toBe('10');
  });

  // ── remove() ──────────────────────────────────────────────────────────────────

  it('remove() deletes a specific temple by id', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); api.record(makeTemple('t2')); });
    await act(async () => { api.remove('t1'); });
    expect(screen.queryByTestId('item-t1')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-t2')).toBeInTheDocument();
  });

  it('remove() updates localStorage', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); });
    await act(async () => { api.remove('t1'); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(0);
  });

  // ── clear() ───────────────────────────────────────────────────────────────────

  it('clear() empties the list', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); api.record(makeTemple('t2')); });
    await act(async () => { api.clear(); });
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('clear() empties localStorage', async () => {
    let api!: ReturnType<typeof useRecentlyViewed>;
    await act(async () => { render(<Harness onMount={(a) => { api = a; }} />); });
    await act(async () => { api.record(makeTemple('t1')); });
    await act(async () => { api.clear(); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(0);
  });
});
