import { ExecutionContext, TooManyRequestsException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserThrottleGuard, USER_THROTTLE_KEY } from './user-throttle.guard';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(
  opts: { limit: number; windowSec: number; name?: string } | undefined,
  userId: string | undefined,
): ExecutionContext {
  const handler = function handlerFn() { return undefined; };
  const cls = class {};

  if (opts !== undefined) {
    Reflect.defineMetadata(USER_THROTTLE_KEY, opts, handler);
  }

  const request = userId ? { user: { id: userId } } : { user: undefined };

  return {
    getHandler:  () => handler,
    getClass:    () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeRedis(incrResult = 1): any {
  return {
    incr:   jest.fn().mockResolvedValue(incrResult),
    expire: jest.fn().mockResolvedValue(1),
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UserThrottleGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  // ── passthrough paths ──────────────────────────────────────────────────────

  it('returns true immediately when no @UserThrottle metadata on the route', async () => {
    const redis = makeRedis();
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext(undefined, 'user-1');
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('returns true for unauthenticated requests (no req.user) without calling Redis', async () => {
    const redis = makeRedis();
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60 }, undefined);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  // ── normal operation ───────────────────────────────────────────────────────

  it('returns true when count is within limit', async () => {
    const redis = makeRedis(1);
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60 }, 'user-1');
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('calls redis.incr with a key containing userId, ruleName, and bucket', async () => {
    const redis = makeRedis(1);
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60, name: 'create-booking' }, 'user-42');
    await guard.canActivate(ctx);
    const [key] = redis.incr.mock.calls[0];
    expect(key).toContain('user-42');
    expect(key).toContain('create-booking');
  });

  it('sets TTL on the first hit (count === 1)', async () => {
    const redis = makeRedis(1); // first hit
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60 }, 'user-1');
    await guard.canActivate(ctx);
    expect(redis.expire).toHaveBeenCalled();
    const [, ttl] = redis.expire.mock.calls[0];
    expect(ttl).toBe(61); // windowSec + 1
  });

  it('does NOT set TTL on subsequent hits (count > 1)', async () => {
    const redis = makeRedis(2); // not first hit
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60 }, 'user-1');
    await guard.canActivate(ctx);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  // ── limit enforcement ──────────────────────────────────────────────────────

  it('throws TooManyRequestsException when count exceeds limit', async () => {
    const redis = makeRedis(6); // limit is 5
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 5, windowSec: 60, name: 'create-booking' }, 'user-1');
    await expect(guard.canActivate(ctx)).rejects.toThrow(TooManyRequestsException);
  });

  it('throws TooManyRequestsException when count exactly equals limit + 1', async () => {
    const redis = makeRedis(4); // limit is 3
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 3, windowSec: 30 }, 'user-1');
    await expect(guard.canActivate(ctx)).rejects.toThrow(TooManyRequestsException);
  });

  it('allows the request exactly at the limit (count === limit)', async () => {
    const redis = makeRedis(3); // count equals limit
    const guard = new UserThrottleGuard(reflector, redis);
    const ctx   = makeContext({ limit: 3, windowSec: 30 }, 'user-1');
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  // ── rule name fallback ─────────────────────────────────────────────────────

  it('uses handler function name as ruleName when name is not specified', async () => {
    const redis = makeRedis(1);
    const guard = new UserThrottleGuard(reflector, redis);
    // opts.name is undefined — should fall back to handler.name = 'handlerFn'
    const ctx   = makeContext({ limit: 5, windowSec: 60 }, 'user-1');
    await guard.canActivate(ctx);
    const [key] = redis.incr.mock.calls[0];
    expect(key).toContain('handlerFn');
  });
});
