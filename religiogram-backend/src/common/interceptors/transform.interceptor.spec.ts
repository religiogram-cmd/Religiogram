import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(requestId?: string): ExecutionContext {
  const req = {
    headers: requestId ? { 'x-request-id': requestId } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeHandler(data: unknown) {
  return { handle: () => of(data) };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps the response in { success: true, data, meta }', async () => {
    const ctx = makeContext('req-123');
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler({ id: 1 }) as any),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
    expect(result.meta).toBeDefined();
  });

  it('uses x-request-id header value when present', async () => {
    const ctx = makeContext('req-abc-xyz');
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(null) as any),
    );
    expect(result.meta.requestId).toBe('req-abc-xyz');
  });

  it('generates a requestId when x-request-id header is absent', async () => {
    const ctx = makeContext(); // no header
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(null) as any),
    );
    expect(typeof result.meta.requestId).toBe('string');
    expect(result.meta.requestId.length).toBeGreaterThan(0);
  });

  it('meta.timestamp is an ISO date string', async () => {
    const ctx = makeContext();
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler('hello') as any),
    );
    expect(() => new Date(result.meta.timestamp)).not.toThrow();
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('passes through null data correctly', async () => {
    const ctx = makeContext('r1');
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(null) as any),
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('passes through array data correctly', async () => {
    const ctx = makeContext('r2');
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler([1, 2, 3]) as any),
    );
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('passes through nested object data correctly', async () => {
    const ctx = makeContext('r3');
    const payload = { user: { id: 'u1', name: 'Alice' }, token: 'jwt' };
    const result = await lastValueFrom(
      interceptor.intercept(ctx, makeHandler(payload) as any),
    );
    expect(result.data).toEqual(payload);
  });

  it('two calls generate different requestIds when no header is set', async () => {
    const ctx = makeContext();
    const r1 = await lastValueFrom(interceptor.intercept(ctx, makeHandler(1) as any));
    const r2 = await lastValueFrom(interceptor.intercept(ctx, makeHandler(2) as any));
    // Random IDs should almost certainly differ
    expect(r1.meta.requestId).not.toBe(r2.meta.requestId);
  });
});
