import { GoogleOAuthGuard } from './google-oauth.guard';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('GoogleOAuthGuard', () => {
  /**
   * GoogleOAuthGuard is a one-liner that extends AuthGuard('google').
   * Tests verify:
   *   1. Instantiable without DI
   *   2. canActivate delegates to passport super (not short-circuited)
   *   3. super returning false propagates to caller
   */
  let guard: GoogleOAuthGuard;

  beforeEach(() => {
    guard = new GoogleOAuthGuard();
  });

  it('is instantiable without DI context', () => {
    expect(guard).toBeInstanceOf(GoogleOAuthGuard);
  });

  it('delegates canActivate to passport super (google strategy)', () => {
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(GoogleOAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);

    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
      getHandler: () => () => undefined,
      getClass:   () => class {},
    };

    const result = guard.canActivate(ctx);
    expect(superSpy).toHaveBeenCalledWith(ctx);
    expect(result).toBe(true);

    superSpy.mockRestore();
  });

  it('propagates false when super.canActivate returns false', () => {
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(GoogleOAuthGuard.prototype), 'canActivate')
      .mockReturnValue(false as any);

    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler:   () => () => undefined,
      getClass:     () => class {},
    };

    expect(guard.canActivate(ctx)).toBe(false);
    superSpy.mockRestore();
  });
});
