import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { TokenService } from './token.service';
import { RedisService } from '../../redis/redis.service';

// ── constants ─────────────────────────────────────────────────────────────────

const USER_ID     = 'user-1';
const TOKEN_SECRET = 'test-token-secret-at-least-32chars!!';
const ACCESS_TOKEN  = 'eyJhbGc.access.token';
const REFRESH_TOKEN = 'eyJhbGc.refresh.token';

/** Replicate the service's private hmac() method */
function hmac(token: string): string {
  return createHmac('sha256', TOKEN_SECRET).update(token).digest('hex');
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const redisClient = {
  eval: jest.fn(),
};

const mockRedis = {
  get:        jest.fn().mockResolvedValue(null),
  set:        jest.fn().mockResolvedValue('OK'),
  del:        jest.fn().mockResolvedValue(1),
  scanDelete: jest.fn().mockResolvedValue(undefined),
  getClient:  jest.fn().mockReturnValue(redisClient),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue(ACCESS_TOKEN),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'jwt.privateKey': '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----',
      'jwt.publicKey':  '-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----',
      'otp.secret':     TOKEN_SECRET,
    };
    if (map[key]) return map[key];
    throw new Error(`Config key ${key} not found`);
  }),
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'jwt.issuer':     'religiogram',
      'jwt.audience':   'religiogram-api',
      'jwt.accessTtl':  900,
      'jwt.refreshTtl': 604800,
    };
    return map[key] ?? def;
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TokenService', () => {
  let svc: TokenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwt.signAsync.mockResolvedValue(ACCESS_TOKEN);
    mockRedis.get.mockResolvedValue(null);
    redisClient.eval.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService,    useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService,  useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<TokenService>(TokenService);
  });

  // ── issueTokenPair ─────────────────────────────────────────────────────────

  describe('issueTokenPair()', () => {
    const user: any = { id: USER_ID, phone: '+919876543210', role: 'seeker' };

    it('returns a TokenPair with both access and refresh tokens', async () => {
      mockJwt.signAsync
        .mockResolvedValueOnce(ACCESS_TOKEN)
        .mockResolvedValueOnce(REFRESH_TOKEN);

      const pair = await svc.issueTokenPair(user);

      expect(pair.accessToken).toBe(ACCESS_TOKEN);
      expect(pair.refreshToken).toBe(REFRESH_TOKEN);
      expect(pair.tokenType).toBe('Bearer');
      expect(pair.accessTokenExpiresIn).toBe(900);
      expect(pair.refreshTokenExpiresIn).toBe(604800);
    });

    it('stores HMAC digest of refresh token in Redis', async () => {
      mockJwt.signAsync
        .mockResolvedValueOnce(ACCESS_TOKEN)
        .mockResolvedValueOnce(REFRESH_TOKEN);

      await svc.issueTokenPair(user);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(`refresh:${USER_ID}:`),
        hmac(REFRESH_TOKEN),
        'EX',
        604800,
      );
    });

    it('signs access token with type=access and refresh with type=refresh', async () => {
      await svc.issueTokenPair(user);

      const [accessPayload] = mockJwt.signAsync.mock.calls[0];
      const [refreshPayload] = mockJwt.signAsync.mock.calls[1];
      expect(accessPayload.type).toBe('access');
      expect(refreshPayload.type).toBe('refresh');
    });

    it('includes deviceId in both payloads when provided', async () => {
      await svc.issueTokenPair(user, 'device-xyz');

      const [accessPayload] = mockJwt.signAsync.mock.calls[0];
      expect(accessPayload.deviceId).toBe('device-xyz');
    });
  });

  // ── isRefreshTokenValid ────────────────────────────────────────────────────

  describe('isRefreshTokenValid()', () => {
    it('returns true when presented token matches stored HMAC digest', async () => {
      mockRedis.get.mockResolvedValueOnce(hmac(REFRESH_TOKEN));
      const result = await svc.isRefreshTokenValid(USER_ID, 'jti-1', REFRESH_TOKEN);
      expect(result).toBe(true);
    });

    it('returns false when stored digest does not match', async () => {
      mockRedis.get.mockResolvedValueOnce(hmac('different-token'));
      const result = await svc.isRefreshTokenValid(USER_ID, 'jti-1', REFRESH_TOKEN);
      expect(result).toBe(false);
    });

    it('returns false when no stored token exists (expired or revoked)', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await svc.isRefreshTokenValid(USER_ID, 'jti-1', REFRESH_TOKEN);
      expect(result).toBe(false);
    });
  });

  // ── consumeRefreshToken ────────────────────────────────────────────────────

  describe('consumeRefreshToken()', () => {
    it('returns true when Lua eval returns 1 (match + delete)', async () => {
      redisClient.eval.mockResolvedValueOnce(1);
      const result = await svc.consumeRefreshToken(USER_ID, 'jti-1', REFRESH_TOKEN);
      expect(result).toBe(true);
    });

    it('returns false when Lua eval returns 0 (no match or already consumed)', async () => {
      redisClient.eval.mockResolvedValueOnce(0);
      const result = await svc.consumeRefreshToken(USER_ID, 'jti-1', REFRESH_TOKEN);
      expect(result).toBe(false);
    });

    it('calls eval with correct Redis key and HMAC digest', async () => {
      await svc.consumeRefreshToken(USER_ID, 'jti-1', REFRESH_TOKEN);

      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.any(String), // Lua script
        1,
        `refresh:${USER_ID}:jti-1`,
        hmac(REFRESH_TOKEN),
      );
    });
  });

  // ── revokeRefreshToken ─────────────────────────────────────────────────────

  describe('revokeRefreshToken()', () => {
    it('deletes the specific refresh key from Redis', async () => {
      await svc.revokeRefreshToken(USER_ID, 'jti-123');
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:${USER_ID}:jti-123`);
    });
  });

  // ── revokeAllForUser ───────────────────────────────────────────────────────

  describe('revokeAllForUser()', () => {
    it('calls scanDelete with the user-scoped key pattern', async () => {
      await svc.revokeAllForUser(USER_ID);
      expect(mockRedis.scanDelete).toHaveBeenCalledWith(`refresh:${USER_ID}:*`);
    });
  });
});
