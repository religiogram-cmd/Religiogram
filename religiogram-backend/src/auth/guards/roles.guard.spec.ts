import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(
  requiredRoles: string[] | undefined,
  userRole: string | undefined,
): ExecutionContext {
  const handler = () => undefined;
  const cls     = class {};

  if (requiredRoles !== undefined) {
    Reflect.defineMetadata(ROLES_KEY, requiredRoles, handler);
  }

  const request = userRole
    ? { user: { id: 'user-1', role: userRole } }
    : { user: undefined };

  return {
    getHandler: () => handler,
    getClass:   () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('returns true when no roles are required on the route', () => {
    const ctx = makeContext(undefined, 'seeker');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when required roles array is empty', () => {
    const ctx = makeContext([], 'seeker');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when user role matches one of the required roles', () => {
    const ctx = makeContext(['admin', 'advisor'], 'admin');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when user role is exactly the single required role', () => {
    const ctx = makeContext(['advisor'], 'advisor');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user role is not in required roles', () => {
    const ctx = makeContext(['admin'], 'seeker');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user role is advisor but admin is required', () => {
    const ctx = makeContext(['admin'], 'advisor');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when request has no user (unauthenticated)', () => {
    const ctx = makeContext(['admin'], undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ForbiddenException message is "Insufficient privileges"', () => {
    const ctx = makeContext(['admin'], 'seeker');
    let err: any;
    try { guard.canActivate(ctx); } catch (e) { err = e; }
    expect(err.message).toBe('Insufficient privileges');
  });
});
