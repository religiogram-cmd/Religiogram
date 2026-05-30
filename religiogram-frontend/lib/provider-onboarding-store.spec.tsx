/**
 * Tests for lib/provider-onboarding-store.tsx
 *
 * Tests: pure utility functions (rupeesToPaise, paiseToRupees, SERVICE_MODES),
 * ProviderOnboardingProvider + useProviderOnboarding hook behaviour
 * (update, advance, reset, localStorage persistence).
 *
 * providerOnboardingApi is mocked to prevent real network calls.
 */

jest.mock('./provider-onboarding-api', () => ({
  providerOnboardingApi: {
    getDraft: jest.fn(),
    saveDraft: jest.fn(),
  },
}));

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
  ProviderOnboardingProvider,
  useProviderOnboarding,
  rupeesToPaise,
  paiseToRupees,
  SERVICE_MODES,
  LOCAL_KEY,
} from './provider-onboarding-store';
import { providerOnboardingApi } from './provider-onboarding-api';

const getDraftMock = providerOnboardingApi.getDraft as jest.Mock;
const saveDraftMock = providerOnboardingApi.saveDraft as jest.Mock;

// ── pure utilities ─────────────────────────────────────────────────────────────

describe('rupeesToPaise', () => {
  it('converts integer rupees to paise', () => {
    expect(rupeesToPaise(500)).toBe(50000);
  });

  it('converts string rupees to paise', () => {
    expect(rupeesToPaise('100')).toBe(10000);
  });

  it('returns 0 for negative input', () => {
    expect(rupeesToPaise(-1)).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(rupeesToPaise('abc')).toBe(0);
  });

  it('rounds fractional rupees', () => {
    expect(rupeesToPaise(1.005)).toBeGreaterThan(0);
  });
});

describe('paiseToRupees', () => {
  it('converts paise to rupees', () => {
    expect(paiseToRupees(50000)).toBe(500);
  });

  it('converts 100 paise to 1 rupee', () => {
    expect(paiseToRupees(100)).toBe(1);
  });

  it('returns 0 for 0 paise', () => {
    expect(paiseToRupees(0)).toBe(0);
  });
});

describe('SERVICE_MODES', () => {
  it('has 3 items', () => {
    expect(SERVICE_MODES).toHaveLength(3);
  });

  it('includes online, offline, both', () => {
    const values = SERVICE_MODES.map(m => m.value);
    expect(values).toContain('online');
    expect(values).toContain('offline');
    expect(values).toContain('both');
  });
});

// ── Hook harness ───────────────────────────────────────────────────────────────

function Harness({ onMount }: { onMount: (api: ReturnType<typeof useProviderOnboarding>) => void }) {
  const api = useProviderOnboarding();
  React.useEffect(() => { onMount(api); }, []);
  return (
    <div>
      <span data-testid="step">{api.step}</span>
      <span data-testid="status">{api.saveStatus}</span>
      <span data-testid="fullName">{(api.data as any).fullName ?? ''}</span>
    </div>
  );
}

function wrap(onMount: (api: ReturnType<typeof useProviderOnboarding>) => void) {
  return (
    <ProviderOnboardingProvider>
      <Harness onMount={onMount} />
    </ProviderOnboardingProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  jest.useFakeTimers();
  // Default: getDraft rejects (offline) so tests don't hang
  getDraftMock.mockRejectedValue(new Error('offline'));
  saveDraftMock.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
});

describe('useProviderOnboarding', () => {
  // ── initial state ──────────────────────────────────────────────────────────

  it('starts at step 1', async () => {
    await act(async () => { render(wrap(() => {})); });
    expect(screen.getByTestId('step').textContent).toBe('1');
  });

  it('throws when used outside ProviderOnboardingProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness onMount={() => {}} />)).toThrow(
      'useProviderOnboarding must be used inside <ProviderOnboardingProvider>',
    );
    consoleSpy.mockRestore();
  });

  // ── update() ──────────────────────────────────────────────────────────────

  it('update() merges data into state', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.update({ fullName: 'Arjun Sharma' }); });
    expect(screen.getByTestId('fullName').textContent).toBe('Arjun Sharma');
  });

  it('update() writes to localStorage', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.update({ fullName: 'Priya Singh' }); });
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(stored.data.fullName).toBe('Priya Singh');
  });

  // ── advance() ─────────────────────────────────────────────────────────────

  it('advance() advances the step', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.advance(3); });
    expect(screen.getByTestId('step').textContent).toBe('3');
  });

  it('advance() is monotonic: does not go backwards', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.advance(5); });
    await act(async () => { api.advance(2); }); // lower step — should be ignored
    expect(screen.getByTestId('step').textContent).toBe('5');
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  it('reset() sets step back to 1 and clears data', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.update({ fullName: 'Test' }); api.advance(4); });
    await act(async () => { api.reset(); });
    expect(screen.getByTestId('step').textContent).toBe('1');
    expect(screen.getByTestId('fullName').textContent).toBe('');
  });

  it('reset() removes LOCAL_KEY from localStorage', async () => {
    let api!: ReturnType<typeof useProviderOnboarding>;
    await act(async () => { render(wrap((a) => { api = a; })); });
    await act(async () => { api.update({ fullName: 'Test' }); });
    await act(async () => { api.reset(); });
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  // ── localStorage hydration ────────────────────────────────────────────────

  it('hydrates from localStorage on mount', async () => {
    const stored = { step: 3, data: { fullName: 'Stored Name' }, saveStatus: 'synced', updatedAt: Date.now() };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stored));
    await act(async () => { render(wrap(() => {})); });
    expect(screen.getByTestId('step').textContent).toBe('3');
    expect(screen.getByTestId('fullName').textContent).toBe('Stored Name');
  });
});
