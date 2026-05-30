import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal ExecutionContext that JwtAuthGuard inspects via Reflector.
 * The handler and class are plain function stubs — Reflector reads metadata
 * set on them via Reflect.defineMetadata.
 */
function makeContext(isPublicHandler = false, isPublicClass = false): ExecutionContext {
  const handler = () => undefined;
  const cls     = class {};

  if (isPublicHandler) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  }
  if (isPublicClass) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, cls);
  }

  return {
    getHandler: () => handler,
    getClass:   () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: 'Bearer valid.jwt.token' } }),
    }),
  } as unknown as ExecutionContext;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('returns true immediately when handler is decorated @Public()', () => {
    const ctx = makeContext(true, false);
    // canActivate returns true for public routes without calling passport
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('returns true immediately when class is decorated @Public()', () => {
    const ctx = makeContext(false, true);
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('delegates to super.canActivate (passport jwt) for protected routes', () => {
    const ctx = makeContext(false, false);
    // super.canActivate will try to verify the JWT — spy on it so the test
    // doesn't need a real JWT secret / passport strategy wired up.
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);

    const result = guard.canActivate(ctx);
    expect(superSpy).toHaveBeenCalledWith(ctx);
    expect(result).toBe(true);

    superSpy.mockRestore();
  });

  it('does NOT bypass authentication when IS_PUBLIC_KEY is not set', () => {
    const ctx = makeContext(false, false);
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(false as any);

    const result = guard.canActivate(ctx);
    expect(superSpy).toHaveBeenCalled();
    expect(result).toBe(false);

    superSpy.mockRestore();
  });
});
