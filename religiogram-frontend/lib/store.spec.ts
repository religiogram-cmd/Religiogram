/**
 * Tests for lib/store.ts (useAuthStore Zustand store).
 *
 * We run in jsdom, so sessionStorage is available. We spy on its methods to
 * verify side-effects without coupling too tightly to the implementation.
 */

import { useAuthStore } from './store';

// ── helpers ───────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-1',
  phone: '+919999999999',
  name: 'Arjun Kumar',
  role: 'user' as const,
  isProfileComplete: true,
};

const MOCK_TOKEN = 'access-token-xyz';

function resetStore(): void {
  // Reset Zustand state directly via setState
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isHydrated: false,
  });
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('useAuthStore', () => {
  beforeEach(() => {
    resetStore();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  // ── initial state ───────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('user is null', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('accessToken is null', () => {
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('isHydrated is false', () => {
      expect(useAuthStore.getState().isHydrated).toBe(false);
    });
  });

  // ── setAuth ─────────────────────────────────────────────────────────────────

  describe('setAuth()', () => {
    it('sets user and accessToken in the store', () => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
      const { user, accessToken } = useAuthStore.getState();
      expect(user).toEqual(MOCK_USER);
      expect(accessToken).toBe(MOCK_TOKEN);
    });

    it('persists the token to sessionStorage', () => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
      expect(sessionStorage.getItem('rg_token')).toBe(MOCK_TOKEN);
    });

    it('overwrites a previous token on successive calls', () => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
      useAuthStore.getState().setAuth(MOCK_USER, 'newer-token');
      expect(sessionStorage.getItem('rg_token')).toBe('newer-token');
      expect(useAuthStore.getState().accessToken).toBe('newer-token');
    });
  });

  // ── clearAuth ───────────────────────────────────────────────────────────────

  describe('clearAuth()', () => {
    beforeEach(() => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
    });

    it('sets user to null', () => {
      useAuthStore.getState().clearAuth();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('sets accessToken to null', () => {
      useAuthStore.getState().clearAuth();
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('removes rg_token from sessionStorage', () => {
      useAuthStore.getState().clearAuth();
      expect(sessionStorage.getItem('rg_token')).toBeNull();
    });
  });

  // ── setUser ─────────────────────────────────────────────────────────────────

  describe('setUser()', () => {
    it('merges a partial update into the existing user', () => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
      useAuthStore.getState().setUser({ name: 'New Name' });
      expect(useAuthStore.getState().user?.name).toBe('New Name');
      // unchanged fields still present
      expect(useAuthStore.getState().user?.id).toBe('user-1');
      expect(useAuthStore.getState().user?.role).toBe('user');
    });

    it('does nothing (leaves user as null) when user is not logged in', () => {
      useAuthStore.getState().setUser({ name: 'Ghost' });
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('can update multiple fields at once', () => {
      useAuthStore.getState().setAuth(MOCK_USER, MOCK_TOKEN);
      useAuthStore.getState().setUser({ name: 'Updated', isProfileComplete: false });
      const { user } = useAuthStore.getState();
      expect(user?.name).toBe('Updated');
      expect(user?.isProfileComplete).toBe(false);
      // Untouched fields
      expect(user?.id).toBe('user-1');
    });
  });

  // ── hydrate ─────────────────────────────────────────────────────────────────

  describe('hydrate()', () => {
    it('sets isHydrated to true', () => {
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });

    it('restores accessToken from sessionStorage when token exists', () => {
      sessionStorage.setItem('rg_token', 'stored-token');
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().accessToken).toBe('stored-token');
    });

    it('leaves accessToken as null when sessionStorage has no token', () => {
      useAuthStore.getState().hydrate();
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('does not touch user (user remains null after hydrate)', () => {
      sessionStorage.setItem('rg_token', 'stored-token');
      useAuthStore.getState().hydrate();
      // hydrate only restores the token, not the full user object
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
