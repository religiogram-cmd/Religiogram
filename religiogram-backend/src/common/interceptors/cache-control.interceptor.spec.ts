import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import { CacheControlInterceptor, CACHE_CONTROL_KEY } from './cache-control.interceptor';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(directive?: string): {
  ctx: ExecutionContext;
  mockSetHeader: jest.Mock;
  mockGetHeader: jest.Mock;
  mockHeadersSent: boolean;
} {
  const handler = () => undefined;
  const cls     = class {};

  if (directive !== undefined) {
    Reflect.defineMetadata(CACHE_CONTROL_KEY, directive, handler);
  }

  const mockSetHeader = jest.fn();
  const mockGetHeader = jest.fn().mockReturnValue(undefined); // no existing header
  let mockHeadersSent = false;

  const res = {
    setHeader:   mockSetHeader,
    getHeader:   mockGetHeader,
    get headersSent() { return mockHeadersSent; },
  };

  const ctx = {
    getHandler:   () => handler,
    getClass:     () => cls,
    switchToHttp: () => ({
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;

  return { ctx, mockSetHeader, mockGetHeader, mockHeadersSent };
}

function makeHandler() {
  return { handle: () => of({ ok: true }) };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CacheControlInterceptor', () => {
  let reflector: Reflector;
  let interceptor: CacheControlInterceptor;

  beforeEach(() => {
    reflector    = new Reflector();
    interceptor  = new CacheControlInterceptor(reflector);
  });

  it('sets the directive from @CacheControl metadata after handler resolves', async () => {
    const { ctx, mockSetHeader } = makeContext('public, max-age=30, stale-while-revalidate=120');
    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=30, stale-while-revalidate=120',
    );
  });

  it('falls back to "no-store" when no @CacheControl decorator is present', async () => {
    const { ctx, mockSetHeader } = makeContext(); // no metadata
    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('sets "private, max-age=10" for private routes', async () => {
    const { ctx, mockSetHeader } = makeContext('private, max-age=10');
    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=10');
  });

  it('does not overwrite an already-present Cache-Control header', async () => {
    const handler = () => undefined;
    const cls     = class {};
    Reflect.defineMetadata(CACHE_CONTROL_KEY, 'public, max-age=60', handler);

    const mockSetHeader = jest.fn();
    const mockGetHeader = jest.fn().mockReturnValue('no-cache'); // header already set
    const res = {
      setHeader:   mockSetHeader,
      getHeader:   mockGetHeader,
      headersSent: false,
    };
    const ctx = {
      getHandler:   () => handler,
      getClass:     () => cls,
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).not.toHaveBeenCalled();
  });

  it('does not set header when headers are already sent', async () => {
    const handler = () => undefined;
    const cls     = class {};
    Reflect.defineMetadata(CACHE_CONTROL_KEY, 'public, max-age=60', handler);

    const mockSetHeader = jest.fn();
    const res = {
      setHeader:   mockSetHeader,
      getHeader:   jest.fn().mockReturnValue(undefined),
      headersSent: true, // already flushed
    };
    const ctx = {
      getHandler:   () => handler,
      getClass:     () => cls,
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).not.toHaveBeenCalled();
  });

  it('sets "no-store" as default for protected money-path routes', async () => {
    // No @CacheControl on wallet/booking routes → must not be cached
    const { ctx, mockSetHeader } = makeContext();
    await lastValueFrom(interceptor.intercept(ctx, makeHandler() as any));
    expect(mockSetHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
