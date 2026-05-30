/**
 * Tests for lib/profile-draft.ts
 *
 * Uses Jest fake timers to control the 600 ms debounce, and mocks
 * profileApi.update so no real network calls are made.
 *
 * IMPORTANT: profile-draft.ts has module-level state (pending, timer,
 * inflight). We call profileDraft.reset() in beforeEach to wipe it.
 */

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockUpdate = jest.fn();

jest.mock('@/lib/api', () => ({
  profileApi: {
    update: (...args: any[]) => mockUpdate(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

// ── import under test ─────────────────────────────────────────────────────────

import { profileDraft } from './profile-draft';
import type { ProfileDraft } from './profile-draft';

const STORAGE_KEY = 'rg_profile_draft_v1';

// ── helpers ───────────────────────────────────────────────────────────────────

function writeStorage(value: Partial<ProfileDraft>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('profileDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUpdate.mockResolvedValue({});
    localStorage.clear();
    profileDraft.reset(); // clear module-level debounce state
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── load() ──────────────────────────────────────────────────────────────────

  describe('load()', () => {
    it('returns EMPTY draft when localStorage is empty', () => {
      const draft = profileDraft.load();
      expect(draft.step).toBe(0);
      expect(draft.data).toEqual({});
      expect(draft.completed).toBe(false);
      expect(draft.updatedAt).toBe(0);
    });

    it('parses a valid stored draft', () => {
      writeStorage({ step: 2, data: { name: 'Arjun' }, updatedAt: 1000, completed: false });
      const draft = profileDraft.load();
      expect(draft.step).toBe(2);
      expect(draft.data).toEqual({ name: 'Arjun' });
      expect(draft.updatedAt).toBe(1000);
    });

    it('returns EMPTY and clears storage on corrupted JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{bad json}}}');
      const draft = profileDraft.load();
      expect(draft.step).toBe(0);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('handles partial stored data gracefully (missing fields default to EMPTY values)', () => {
      writeStorage({ step: 3 }); // no data, updatedAt, or completed
      const draft = profileDraft.load();
      expect(draft.step).toBe(3);
      expect(draft.data).toEqual({});
      expect(draft.completed).toBe(false);
      expect(draft.updatedAt).toBe(0);
    });
  });

  // ── save() ──────────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('writes the updated draft to localStorage', () => {
      profileDraft.save({ step: 1, data: { religion: 'hindu' } });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.step).toBe(1);
      expect(stored.data.religion).toBe('hindu');
    });

    it('returns the merged draft', () => {
      const result = profileDraft.save({ step: 1, data: { a: 1 } });
      expect(result.step).toBe(1);
      expect(result.data).toEqual({ a: 1 });
      expect(result.completed).toBe(false);
    });

    it('deep-merges data rather than replacing it', () => {
      profileDraft.save({ data: { name: 'Arjun' } });
      profileDraft.save({ data: { city: 'Delhi' } });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.data.name).toBe('Arjun');
      expect(stored.data.city).toBe('Delhi');
    });

    it('bumps updatedAt on each save', () => {
      const before = Date.now();
      const result = profileDraft.save({ step: 2 });
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('schedules a debounced server flush (does not call update immediately)', () => {
      profileDraft.save({ step: 1 });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('calls profileApi.update once after the debounce window', async () => {
      profileDraft.save({ step: 1, data: { x: 1 } });
      jest.runAllTimers();
      await Promise.resolve(); // let the async flush settle
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('coalesces rapid saves into a single server call', async () => {
      profileDraft.save({ step: 1 });
      profileDraft.save({ step: 2 });
      profileDraft.save({ step: 3 });
      jest.runAllTimers();
      await Promise.resolve();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ── reset() ─────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('removes the key from localStorage', () => {
      profileDraft.save({ step: 1 });
      profileDraft.reset();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('cancels any pending server flush', async () => {
      profileDraft.save({ step: 1 });
      profileDraft.reset();
      jest.runAllTimers();
      await Promise.resolve();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('subsequent load() returns EMPTY after reset', () => {
      profileDraft.save({ step: 3, data: { something: true } });
      profileDraft.reset();
      expect(profileDraft.load()).toEqual({ step: 0, data: {}, updatedAt: 0, completed: false });
    });
  });

  // ── finalize() ───────────────────────────────────────────────────────────────

  describe('finalize()', () => {
    it('calls profileApi.update with completed=true', async () => {
      await profileDraft.finalize();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ completed: true }),
      );
    });

    it('merges finalData into the draft before flushing', async () => {
      profileDraft.save({ data: { name: 'Arjun' } });
      await profileDraft.finalize({ city: 'Delhi' });
      const callArg = mockUpdate.mock.calls[0][0];
      expect(callArg.data.name).toBe('Arjun');
      expect(callArg.data.city).toBe('Delhi');
    });

    it('clears localStorage after successful flush', async () => {
      profileDraft.save({ step: 1 });
      await profileDraft.finalize();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('clears localStorage even if profileApi.update fails', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('server error'));
      profileDraft.save({ step: 1 });
      try {
        await profileDraft.finalize();
      } catch {
        // expected
      }
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('silently drops 4xx ApiError (validation failure) without re-queuing', async () => {
      const { ApiError } = jest.requireMock('@/lib/api');
      mockUpdate.mockRejectedValueOnce(new ApiError('VALIDATION', 'bad', 422));
      profileDraft.save({ step: 1 });
      // Should not throw
      await expect(profileDraft.finalize()).resolves.toBeUndefined();
    });
  });
});
