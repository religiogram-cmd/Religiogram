import { create } from 'zustand';
import { tokenStore } from './api';

interface User {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
  fullName?: string;
  avatarUrl?: string;
  role: 'user' | 'provider' | 'admin' | 'seeker' | 'advisor';
  isProfileComplete?: boolean;
  isVerified?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isHydrated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
  setUser: (user: Partial<User>) => void;
  hydrate: () => void;
}

// Legacy Zustand store — kept for backward compat with any remaining consumers.
// Token storage is owned exclusively by tokenStore in lib/api.ts (in-memory).
// This store only holds the user object and a hydration flag; it does NOT
// read/write sessionStorage so there is no conflict with the canonical token.
export const useAuthStore = create<AuthState>((set: any) => ({
  user: null,
  accessToken: null,
  isHydrated: false,

  setAuth: (user: any, accessToken: any) => {
    // Do NOT persist to sessionStorage — tokenStore in lib/api.ts owns the token.
    set({ user, accessToken });
  },

  clearAuth: () => {
    set({ user: null, accessToken: null });
  },

  setUser: (partial: any) =>
    set((s: any) => ({ user: s.user ? { ...s.user, ...partial } : null })),

  hydrate: () => {
    // Hydration is driven by the layout bootstrap (app/(app)/layout.tsx).
    // Nothing to read from sessionStorage.
    set({ isHydrated: true });
  },
}));

/**
 * useMe — reads the dev-panel user from localStorage (set by DevPanel loginAs).
 * In production the user object comes from the JWT + /users/me API call.
 * This hook is the single source of truth for "who am I?" in client components.
 */
export function useMe(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const access = (tokenStore.access ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rg_access') : null)) || '';
    if (!access) return null;
    const b64 = access.split('.')[1];
    if (!b64) return null;
    const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
    return { id: payload.sub || '', role: payload.role || 'user' } as unknown as User;
  } catch {
    return null;
  }
}
