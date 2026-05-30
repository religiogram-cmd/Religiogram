import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpThrottleGuard } from './otp-throttle.guard';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Redis client mock — eval returns a configurable call count */
function makeRedisClient(evalResult: number | number[] = 1): any {
  const results = Array.isArray(evalResult) ? [...evalResult] : null;
  let callCount = 0;
  return {
    eval: jest.fn().mockImplementation(() => {
      if (results) {
        return Promise.resolve(results[callCount++] ?? 1);
      }
      return Promise.resolve(evalResult as number);
    }),
  };
}

function makeRedisService(evalResult: number | number[] = 1): any {
  return { getClient: jest.fn().mockReturnValue(makeRedisClient(evalResult)) };
}

function makeConfig(phoneLimit = 3, ipLimit = 10): any {
  return {
    get: jest.fn((key: string, defaultVal: number) => {
      if (key === 'rateLimit.sendOtpPhone') return phoneLimit;
      if (key === 'rateLimit.sendOtpIp')   return ipLimit;
      return defaultVal;
    }),
  };
}

function makeContext(body: Record<string, unknown> = {}, ip = '1.2.3.4'): ExecutionContext {
  const req = { body, ip, headers: {}, socket: {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeContextWithForwardedFor(body: Record<string, unknown>, xff: string): ExecutionContext {
  const req = { body, ip: undefined, headers: { 'x-forwarded-for': xff }, socket: {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('OtpThrottleGuard', () => {
  it('returns true when both phone and IP counters are within limits', async () => {
    const redis  = makeRedisService(1); // first call for phone, second for IP both return 1
    const config = makeConfig(3, 10);
    const guard  = new OtpThrottleGuard(redis, config as ConfigService);

    const ctx = makeContext({ phone: '+919876543210' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws TooManyRequestsException when phone counter exceeds limit', async () => {
    // Phone counter = 4 (limit 3) → over limit; IP counter never checked
    const redis  = makeRedisService([4, 1]);
    const config = makeConfig(3, 10);
    const guard  = new OtpThrottleGuard(redis, config as ConfigService);

    const ctx = makeContext({ phone: '+919876543210' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(TooManyRequestsException);
  });

  it('throws TooManyRequestsException when IP counter exceeds limit', async () => {
    // Phone counter OK (1), IP counter = 11 (limit 10)
    const redis  = makeRedisService([1, 11]);
    const config = makeConfig(3, 10);
    const guard  = new OtpThrottleGuard(redis, config as ConfigService);

    const ctx = makeContext({ phone: '+919876543210' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(TooManyRequestsException);
  });

  it('skips per-phone throttle when phone field is absent', async () => {
    // Only one eval call — the IP check (no phone check)
    const client = makeRedisClient(1);
    const redis: any = { getClient: jest.fn().mockReturnValue(client) };
    const guard = new OtpThrottleGuard(redis, makeConfig() as ConfigService);

    const ctx = makeContext({}); // no phone in body
    await guard.canActivate(ctx);
    expect(client.eval).toHaveBeenCalledTimes(1); // IP only
  });

  it('skips per-phone throttle when phone is not a string (type confusion guard)', async () => {
    const client = makeRedisClient(1);
    const redis: any = { getClient: jest.fn().mockReturnValue(client) };
    const guard = new OtpThrottleGuard(redis, makeConfig() as ConfigService);

    const ctx = makeContext({ phone: null as any }); // null phone
    await guard.canActivate(ctx);
    expect(client.eval).toHaveBeenCalledTimes(1);
  });

  it('skips per-phone throttle when phone is an empty string', async () => {
    const client = makeRedisClient(1);
    const redis: any = { getClient: jest.fn().mockReturnValue(client) };
    const guard = new OtpThrottleGuard(redis, makeConfig() as ConfigService);

    const ctx = makeContext({ phone: '' });
    await guard.canActivate(ctx);
    expect(client.eval).toHaveBeenCalledTimes(1);
  });

  it('uses X-Forwarded-For header when req.ip is absent', async () => {
    const client = makeRedisClient(1);
    const redis: any = { getClient: jest.fn().mockReturnValue(client) };
    const guard = new OtpThrottleGuard(redis, makeConfig() as ConfigService);

    const ctx = makeContextWithForwardedFor({}, '203.0.113.1, 10.0.0.1');
    await guard.canActivate(ctx);

    // The IP used in the Redis key should be the first entry from XFF
    const evalCall = client.eval.mock.calls[0];
    const key = evalCall[2]; // KEYS[1]
    expect(key).toContain('203.0.113.1');
  });

  it('uses config values for phone and IP limits', async () => {
    const config: any = {
      get: jest.fn((key: string) => {
        if (key === 'rateLimit.sendOtpPhone') return 5;
        if (key === 'rateLimit.sendOtpIp')   return 20;
        return undefined;
      }),
    };
    const redis = makeRedisService(1);
    new OtpThrottleGuard(redis, config as ConfigService);
    expect(config.get).toHaveBeenCalledWith('rateLimit.sendOtpPhone', 3);
    expect(config.get).toHaveBeenCalledWith('rateLimit.sendOtpIp', 10);
  });
});
