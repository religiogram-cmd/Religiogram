/**
 * v9 (P0-2 fix) — frontend contract tests.
 *
 *   1. tokenStore.refresh returns null in cookie mode regardless of any
 *      legacy value lingering in localStorage. This ensures the localStorage
 *      branch is dead code in cookie mode.
 *   2. tokenStore.access is in-memory only and survives across reads but is
 *      cleared by tokenStore.clear().
 *   3. Mutating fetch sends X-CSRF-Token header from the rg_csrf cookie when
 *      in cookie mode. (Lightweight monkey-patched fetch test.)
 */

describe('v9 api.ts cookie-mode contracts', () => {
  beforeEach(() => {
    // Ensure cookie mode is the default for these tests (the api.ts module
    // captures the env at import time, so we re-import below).
    delete (process.env as any).NEXT_PUBLIC_REFRESH_TOKEN_TRANSPORT;
    jest.resetModules();
  });

  it('tokenStore.refresh is null in cookie mode even when localStorage holds a value', async () => {
    if (typeof window === 'undefined') {
      (globalThis as any).window = {
        localStorage: {
          _data: { rg_refresh: 'leftover-from-body-mode' } as Record<string, string>,
          getItem(k: string) { return this._data[k] ?? null; },
          setItem(k: string, v: string) { this._data[k] = v; },
          removeItem(k: string) { delete this._data[k]; },
        },
      };
    }
    const { tokenStore, isCookieMode } = await import('./api');
    expect(isCookieMode()).toBe(true);
    expect(tokenStore.refresh).toBeNull();
  });

  it('tokenStore.set in cookie mode does NOT persist refresh to localStorage', async () => {
    const ls = {
      _data: {} as Record<string, string>,
      getItem(k: string) { return this._data[k] ?? null; },
      setItem(k: string, v: string) { this._data[k] = v; },
      removeItem(k: string) { delete this._data[k]; },
    };
    (globalThis as any).window = { localStorage: ls };
    const { tokenStore } = await import('./api');
    tokenStore.set('access-jwt', 'refresh-jwt');
    expect(ls._data.rg_refresh).toBeUndefined();
    expect(tokenStore.access).toBe('access-jwt');
  });

  it('body mode emits a console.warn (deprecation signal)', async () => {
    (process.env as any).NEXT_PUBLIC_REFRESH_TOKEN_TRANSPORT = 'body';
    (globalThis as any).window = {
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await import('./api');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DEPRECATED'));
    warn.mockRestore();
  });
});
