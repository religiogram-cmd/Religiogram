import { UserThrottlerGuard } from './user-throttler.guard';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UserThrottlerGuard', () => {
  /**
   * UserThrottlerGuard overrides getTracker() from ThrottlerGuard.
   * We test the tracker key derivation directly — the inherited throttle
   * logic (storage, window, limit) is covered by @nestjs/throttler's own tests.
   */
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    // ThrottlerGuard constructor requires throttlerOptions and storageService;
    // pass empty mocks since we only test the overridden method.
    guard = new UserThrottlerGuard(
      [] as any,   // throttlerOptions
      {} as any,   // storageService
      {} as any,   // reflector
    );
  });

  it('returns "user:<userId>" when req.user.id is present', async () => {
    const req: any = { user: { id: 'user-42' }, ip: '1.2.3.4' };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('user:user-42');
  });

  it('returns "ip:<ip>" when req.user is absent', async () => {
    const req: any = { user: undefined, ip: '10.0.0.1' };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns "ip:unknown" when both user and ip are absent', async () => {
    const req: any = { user: undefined, ip: undefined };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:unknown');
  });

  it('falls back to ip when user object has no id field', async () => {
    const req: any = { user: {}, ip: '203.0.113.5' };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('ip:203.0.113.5');
  });

  it('prefers user id over ip when both are present', async () => {
    const req: any = { user: { id: 'user-99' }, ip: '5.5.5.5' };
    const tracker = await (guard as any).getTracker(req);
    expect(tracker).toBe('user:user-99');
    expect(tracker).not.toContain('ip');
  });
});
