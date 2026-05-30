import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStrategy(): JwtStrategy {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('fake-public-key'),
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  return new JwtStrategy(config);
}

function accessPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    phone: '+919999999999',
    role: 'user',
    jti: 'jti-abc',
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  } as JwtPayload;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = makeStrategy();
  });

  describe('validate()', () => {
    it('returns AuthenticatedUser for a valid access token payload', async () => {
      const payload = accessPayload();
      const result = await strategy.validate(payload);
      expect(result).toEqual({
        id:       payload.sub,
        phone:    payload.phone,
        role:     payload.role,
        jti:      payload.jti,
        deviceId: payload.deviceId,
      });
    });

    it('maps sub → id correctly', async () => {
      const result = await strategy.validate(accessPayload({ sub: 'uuid-xyz' }));
      expect(result.id).toBe('uuid-xyz');
    });

    it('includes deviceId when present in payload', async () => {
      const result = await strategy.validate(
        accessPayload({ deviceId: 'device-123' } as any),
      );
      expect(result.deviceId).toBe('device-123');
    });

    it('throws UnauthorizedException when token type is "refresh"', async () => {
      await expect(strategy.validate(accessPayload({ type: 'refresh' }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when token type is missing', async () => {
      await expect(
        strategy.validate({ ...accessPayload(), type: undefined } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an unknown token type', async () => {
      await expect(
        strategy.validate({ ...accessPayload(), type: 'magic' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('error message mentions "Invalid token type"', async () => {
      await expect(
        strategy.validate(accessPayload({ type: 'refresh' })),
      ).rejects.toThrow('Invalid token type');
    });
  });
});
