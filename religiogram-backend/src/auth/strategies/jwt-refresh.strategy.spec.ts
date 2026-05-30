import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStrategy(): JwtRefreshStrategy {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('fake-public-key'),
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  return new JwtRefreshStrategy(config);
}

function refreshPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-2',
    phone: '+918888888888',
    role: 'user',
    jti: 'jti-refresh',
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
    ...overrides,
  } as JwtPayload;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;

  beforeEach(() => {
    strategy = makeStrategy();
  });

  describe('validate()', () => {
    it('returns AuthenticatedUser for a valid refresh token payload', async () => {
      const payload = refreshPayload();
      const result = await strategy.validate(payload);
      expect(result).toEqual({
        id:       payload.sub,
        phone:    payload.phone,
        role:     payload.role,
        jti:      payload.jti,
        deviceId: payload.deviceId,
      });
    });

    it('maps sub → id', async () => {
      const result = await strategy.validate(refreshPayload({ sub: 'user-abc' }));
      expect(result.id).toBe('user-abc');
    });

    it('throws UnauthorizedException when type is "access"', async () => {
      await expect(
        strategy.validate(refreshPayload({ type: 'access' })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when type is absent', async () => {
      await expect(
        strategy.validate({ ...refreshPayload(), type: undefined } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('error message mentions "Expected refresh token"', async () => {
      await expect(
        strategy.validate(refreshPayload({ type: 'access' })),
      ).rejects.toThrow('Expected refresh token');
    });

    it('includes role from payload', async () => {
      const result = await strategy.validate(refreshPayload({ role: 'provider' }));
      expect(result.role).toBe('provider');
    });
  });
});
