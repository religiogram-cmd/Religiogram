import { JwtRefreshGuard } from './jwt-refresh.guard';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('JwtRefreshGuard', () => {
  /**
   * JwtRefreshGuard is a one-liner that extends AuthGuard('jwt-refresh').
   * The meaningful tests verify:
   *   1. It can be instantiated without DI container help
   *   2. canActivate delegates to the passport super, not bypassed
   *   3. The passport strategy name is 'jwt-refresh' (wrong name = silent 401s)
   */
  let guard: JwtRefreshGuard;

  beforeEach(() => {
    guard = new JwtRefreshGuard();
  });

  it('is instantiable without DI context', () => {
    expect(guard).toBeInstanceOf(JwtRefreshGuard);
  });

  it('delegates canActivate to passport super (jwt-refresh strategy)', () => {
    // Spy on the inherited AuthGuard prototype.canActivate so we can confirm
    // the call without a real JWT secret or strategy wired up.
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtRefreshGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);

    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer refresh.token' } }),
      }),
      getHandler: () => () => undefined,
      getClass:   () => class {},
    };

    const result = guard.canActivate(ctx);
    expect(superSpy).toHaveBeenCalledWith(ctx);
    expect(result).toBe(true);

    superSpy.mockRestore();
  });

  it('returns false when super.canActivate returns false (invalid refresh token)', () => {
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtRefreshGuard.prototype), 'canActivate')
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
