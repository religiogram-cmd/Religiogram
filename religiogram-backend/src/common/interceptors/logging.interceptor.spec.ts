import { ExecutionContext, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(
  method = 'GET',
  url = '/api/v1/test',
  ip = '10.0.0.1',
  userId?: string,
  statusCode = 200,
): ExecutionContext {
  const req: any = {
    method,
    url,
    ip,
    user: userId ? { id: userId } : undefined,
    headers: {},
  };
  const res = { statusCode };
  return {
    switchToHttp: () => ({
      getRequest:  () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    logSpy  = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore NODE_ENV
    delete process.env.NODE_ENV;
  });

  // ── success path ───────────────────────────────────────────────────────────

  it('calls logger.log on successful request completion', async () => {
    process.env.NODE_ENV = 'development';
    const ctx = makeContext('GET', '/api/v1/temples', '1.2.3.4', undefined, 200);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') } as any));
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call logger.warn on success', async () => {
    process.env.NODE_ENV = 'development';
    const ctx = makeContext();
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') } as any));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits human-readable log in non-prod mode', async () => {
    process.env.NODE_ENV = 'development';
    const ctx = makeContext('POST', '/api/v1/auth/login', '5.5.5.5', undefined, 201);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({}) } as any));
    const [msg] = logSpy.mock.calls[0];
    expect(msg).toContain('POST');
    expect(msg).toContain('/api/v1/auth/login');
    expect(msg).toContain('201');
  });

  it('emits structured JSON log in production mode', async () => {
    process.env.NODE_ENV = 'production';
    const freshInterceptor = new LoggingInterceptor();
    const ctx = makeContext('GET', '/api/v1/temples', '2.3.4.5', 'user-7', 200);

    await lastValueFrom(freshInterceptor.intercept(ctx, { handle: () => of({}) } as any));

    const [msg] = logSpy.mock.calls[0];
    const parsed = JSON.parse(msg);
    expect(parsed.ev).toBe('http');
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/api/v1/temples');
    expect(parsed.status).toBe(200);
    expect(parsed.userId).toBe('user-7');
    expect(typeof parsed.ms).toBe('number');
  });

  // ── error path ─────────────────────────────────────────────────────────────

  it('calls logger.warn when the handler throws', async () => {
    process.env.NODE_ENV = 'development';
    const ctx = makeContext('POST', '/api/v1/bookings');
    const err = Object.assign(new Error('DB gone'), { status: 500 });

    await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => throwError(() => err) } as any),
    ).catch(() => undefined); // swallow for assertion

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits human-readable warn in non-prod on error', async () => {
    process.env.NODE_ENV = 'development';
    const ctx = makeContext('DELETE', '/api/v1/users/me');
    const err = Object.assign(new Error('unauthorized'), { status: 401 });

    await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => throwError(() => err) } as any),
    ).catch(() => undefined);

    const [msg] = warnSpy.mock.calls[0];
    expect(msg).toContain('DELETE');
    expect(msg).toContain('401');
    expect(msg).toContain('unauthorized');
  });

  it('emits structured JSON warn in production on error', async () => {
    process.env.NODE_ENV = 'production';
    const freshInterceptor = new LoggingInterceptor();
    const ctx = makeContext('POST', '/api/v1/wallet/recharge', '9.9.9.9', 'user-2');
    const err = Object.assign(new Error('payment failed'), { status: 402 });

    await lastValueFrom(
      freshInterceptor.intercept(ctx, { handle: () => throwError(() => err) } as any),
    ).catch(() => undefined);

    const [msg] = warnSpy.mock.calls[0];
    const parsed = JSON.parse(msg);
    expect(parsed.ev).toBe('http_error');
    expect(parsed.status).toBe(402);
    expect(parsed.msg).toBe('payment failed');
    expect(parsed.userId).toBe('user-2');
  });

  it('uses status 500 when error has no status field', async () => {
    process.env.NODE_ENV = 'production';
    const freshInterceptor = new LoggingInterceptor();
    const ctx = makeContext('GET', '/api/v1/health');
    const err = new Error('crash'); // no .status

    await lastValueFrom(
      freshInterceptor.intercept(ctx, { handle: () => throwError(() => err) } as any),
    ).catch(() => undefined);

    const [msg] = warnSpy.mock.calls[0];
    const parsed = JSON.parse(msg);
    expect(parsed.status).toBe(500);
  });
});
