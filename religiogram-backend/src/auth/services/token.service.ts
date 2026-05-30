import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import type { User } from '../../users/entities/user.entity';
import type { JwtPayload, UserRole } from '../interfaces/jwt-payload.interface';
import type { TokenPair } from '../interfaces/auth-response.interface';

/**
 * TokenService — signs, verifies, rotates, and revokes JWTs.
 *
 * Refresh tokens are stored as HMAC-SHA256 digests (not bcrypt).
 * Rationale:
 *   - Server-side secret prevents forgery if Redis is dumped
 *   - ~1000× faster than bcrypt at refresh verification
 *   - Refresh endpoint hit rate can be high at scale (every 15 min per user)
 *
 * Redis layout:
 *   refresh:{userId}:{jti} → HMAC digest (hex), TTL = refresh TTL
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly tokenSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.privateKey = this.config.getOrThrow<string>('jwt.privateKey');
    this.publicKey = this.config.getOrThrow<string>('jwt.publicKey');
    this.issuer = this.config.get<string>('jwt.issuer', 'religiogram');
    this.audience = this.config.get<string>('jwt.audience', 'religiogram-api');
    this.accessTtl = this.config.get<number>('jwt.accessTtl', 900);
    this.refreshTtl = this.config.get<number>('jwt.refreshTtl', 7 * 24 * 60 * 60);
    // P0-4 (v4): dedicated REFRESH_TOKEN_HMAC_SECRET — never reuse OTP_SECRET.
    // main.ts hard-asserts both are present and distinct in production.
    // Fail-fast: no fallback — a missing REFRESH_TOKEN_HMAC_SECRET is a
    // hard startup error (main.ts also asserts this in production).
    this.tokenSecret = this.config.getOrThrow<string>('refreshTokenHmacSecret');
  }

  async issueTokenPair(user: User, deviceId?: string): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = await this.signAccessToken(user.id, user.phone ?? '', user.role, accessJti, deviceId);
    const refreshToken = await this.signRefreshToken(user.id, user.phone ?? '', user.role, refreshJti, deviceId);

    const digest = this.hmac(refreshToken);
    await this.redis.set(this.refreshKey(user.id, refreshJti), digest, 'EX', this.refreshTtl);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTtl,
      refreshTokenExpiresIn: this.refreshTtl,
      tokenType: 'Bearer',
    };
  }

  async isRefreshTokenValid(userId: string, jti: string, presented: string): Promise<boolean> {
    const stored = await this.redis.get(this.refreshKey(userId, jti));
    if (!stored) return false;
    const presentedDigest = this.hmac(presented);
    try {
      return timingSafeEqual(Buffer.from(presentedDigest), Buffer.from(stored));
    } catch {
      return false;
    }
  }

  /**
   * Atomically validate AND consume a refresh token.
   *
   * Uses a Lua script so GET + DEL happen in a single Redis round-trip with
   * no interleaving. This is the critical primitive that makes refresh-token
   * reuse detection actually sound — without it, two parallel refresh calls
   * can both see the same stored digest, both pass validation, and both get
   * new token pairs. With it, exactly one request wins the DEL; the other
   * gets `false` and the caller treats it as reuse.
   *
   * Returns true iff the stored digest matched the presented token and was
   * successfully deleted by this call.
   */
  async consumeRefreshToken(userId: string, jti: string, presented: string): Promise<boolean> {
    const client = this.redis.getClient();
    const presentedDigest = this.hmac(presented);

    // KEYS[1] = refresh key, ARGV[1] = expected digest.
    // Returns 1 on match+delete, 0 otherwise.
    const lua = `
      local stored = redis.call('GET', KEYS[1])
      if not stored then return 0 end
      if stored == ARGV[1] then
        redis.call('DEL', KEYS[1])
        return 1
      end
      return 0
    `;
    const res = (await client.eval(
      lua,
      1,
      this.refreshKey(userId, jti),
      presentedDigest,
    )) as number;
    return res === 1;
  }

  async revokeRefreshToken(userId: string, jti: string): Promise<void> {
    await this.redis.del(this.refreshKey(userId, jti));
    // WS1: Broadcast the revoked JTI to all Socket.IO gateway instances.
    // The consultation gateway subscribes to this channel and immediately
    // disconnects any socket authenticated with this JTI.
    await this.redis.publish('auth:jti:revoked', jti).catch(() => undefined);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    // FIX: use scanDelete() which handles ioredis keyPrefix correctly.
    // The old inline scan + del loop was broken because ioredis does NOT prepend
    // keyPrefix to SCAN match patterns, so the pattern 'refresh:{userId}:*' never
    // matched the actual Redis keys stored as 'rg:refresh:{userId}:*'.
    // scanDelete() builds the full prefixed pattern and uses the raw client for DEL
    // to avoid double-prefixing on deletion.
    await this.redis.scanDelete(`refresh:${userId}:*`);
    // WS1: For logout-all we publish a special userId-scope message.
    // The gateway checks both jti equality AND this userId broadcast.
    await this.redis.publish('auth:jti:revoked', `user:${userId}`).catch(() => undefined);
  }

  private hmac(token: string): string {
    return createHmac('sha256', this.tokenSecret).update(token).digest('hex');
  }

  private async signAccessToken(userId: string, phone: string, role: UserRole, jti: string, deviceId?: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, phone, role, type: 'access', jti, deviceId };
    return this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: this.accessTtl,
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  private async signRefreshToken(userId: string, _phone: string, _role: UserRole, jti: string, _deviceId?: string): Promise<string> {
    // Refresh tokens carry minimal claims — sub + jti only. No PII.
    const payload = { sub: userId, jti, type: 'refresh' };
    return this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: this.refreshTtl,
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }
}
