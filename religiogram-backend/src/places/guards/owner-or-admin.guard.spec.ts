import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OwnerOrAdminGuard } from './owner-or-admin.guard';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(
  user: any,
  params: Record<string, string> = { id: 'place-uuid-1' },
): ExecutionContext {
  const req = { user, params };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const mockClaimsService = {
  canManagePlace: jest.fn(),
};

const PLACE_ID = 'place-uuid-1';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('OwnerOrAdminGuard', () => {
  let guard: OwnerOrAdminGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OwnerOrAdminGuard(mockClaimsService as any);
  });

  // ── auth checks ────────────────────────────────────────────────────────────

  it('throws UnauthorizedException when no user is attached to the request', async () => {
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(mockClaimsService.canManagePlace).not.toHaveBeenCalled();
  });

  // ── missing route param ────────────────────────────────────────────────────

  it('throws ForbiddenException when :id param is absent (developer error)', async () => {
    const ctx = makeContext({ id: 'user-1', role: 'seeker' }, {});
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockClaimsService.canManagePlace).not.toHaveBeenCalled();
  });

  // ── access granted ─────────────────────────────────────────────────────────

  it('returns true when canManagePlace resolves true (owner)', async () => {
    mockClaimsService.canManagePlace.mockResolvedValueOnce(true);
    const ctx = makeContext({ id: 'user-1', role: 'seeker' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockClaimsService.canManagePlace).toHaveBeenCalledWith(PLACE_ID, 'user-1', 'seeker');
  });

  it('returns true when canManagePlace resolves true (admin role)', async () => {
    mockClaimsService.canManagePlace.mockResolvedValueOnce(true);
    const ctx = makeContext({ id: 'admin-1', role: 'admin' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  // ── access denied ──────────────────────────────────────────────────────────

  it('throws ForbiddenException when canManagePlace returns false', async () => {
    mockClaimsService.canManagePlace.mockResolvedValueOnce(false);
    const ctx = makeContext({ id: 'user-1', role: 'seeker' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── NotFoundException passthrough ──────────────────────────────────────────

  it('re-throws NotFoundException when canManagePlace throws it (place not found)', async () => {
    mockClaimsService.canManagePlace.mockRejectedValueOnce(new NotFoundException('Place not found'));
    const ctx = makeContext({ id: 'user-1', role: 'seeker' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('re-throws ForbiddenException from canManagePlace as-is', async () => {
    mockClaimsService.canManagePlace.mockRejectedValueOnce(
      new ForbiddenException('Custom forbidden'),
    );
    const ctx = makeContext({ id: 'user-1', role: 'seeker' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── param forwarding ───────────────────────────────────────────────────────

  it('passes the exact :id param to canManagePlace', async () => {
    mockClaimsService.canManagePlace.mockResolvedValueOnce(true);
    const ctx = makeContext(
      { id: 'user-1', role: 'advisor' },
      { id: 'abc-place-123' },
    );
    await guard.canActivate(ctx);
    expect(mockClaimsService.canManagePlace).toHaveBeenCalledWith('abc-place-123', 'user-1', 'advisor');
  });
});
