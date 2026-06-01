import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import type {
  JwtPayload,
  AuthenticatedUser,
} from '../interfaces/jwt-payload.interface';

/**
 * Validates access tokens on protected routes.
 * Verifies the RS256 signature against the public key.
 *
 * After signature & expiry validation succeed, `validate()`:
 *   1. Rejects non-access tokens (refresh-token confusion guard — a refresh
 *      JWT presented via Authorization: Bearer must NOT authorise an
 *      access-protected endpoint).
 *   2. Enforces minIat: if a refresh-token reuse event was detected for this
 *      user, TokenService set `user:{sub}:minIat` in Redis. Any access token
 *      whose `iat` is earlier than that timestamp is rejected — invalidating
 *      the entire token family without per-token blacklist storage.
 *
 * Restored as part of v4 hardening (P0-3).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly minIatCache = new Map<string, { value: number; expiresAt: number }>();
  private readonly MIN_IAT_CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.privateKey'),
      algorithms: ['HS256'],
      issuer: config.get<string>('jwt.issuer'),
      audience: config.get<string>('jwt.audience'),
    });
  }

  async validate(payload: JwtPayload & { iat?: number }): Promise<AuthenticatedUser> {
    // 1. Reject anything that isn't an access token. Refresh tokens have
    //    type:'refresh' and must only be accepted by JwtRefreshStrategy on
    //    POST /auth/refresh — never on a protected route.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Expected access token');
    }

    // 2. minIat enforcement — invalidate token families after refresh reuse,
    //    role change, or explicit logoutAll. Redis key is set by:
    //      • AuthService.refresh() on reuse-detection
    //      • UsersService.updateProfile() (when role changes)
    //      • AuthService.logoutAll()
    try {
      const cached = this.minIatCache.get(payload.sub);
      let minIat: number | null = null;

      if (cached && cached.expiresAt > Date.now()) {
        minIat = cached.value;
      } else {
        const raw = await this.redis.get(`user:${payload.sub}:minIat`);
        minIat = raw ? parseInt(raw, 10) : null;
        // Cache for 30s as fallback
        if (minIat !== null) {
          this.minIatCache.set(payload.sub, { value: minIat, expiresAt: Date.now() + this.MIN_IAT_CACHE_TTL_MS });
        }
      }

      if (minIat !== null && (payload.iat ?? 0) < minIat) {
        throw new UnauthorizedException('Token revoked');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Redis outage: check in-memory cache, reject if entry shows token is revoked
      const cached = this.minIatCache.get(payload.sub);
      if (cached && (payload.iat ?? 0) < cached.value) {
        throw new UnauthorizedException('Token revoked (cached)');
      }
      // No cache entry — fail CLOSED (reject) to be safe
      this.logger.error({ err, sub: payload.sub }, 'Redis unavailable for minIat check — rejecting token');
      throw new UnauthorizedException('Auth service temporarily unavailable');
    }

    return {
      id: payload.sub,
      phone: payload.phone,
      role: payload.role,
      jti: payload.jti,
      deviceId: payload.deviceId,
    };
  }
}
