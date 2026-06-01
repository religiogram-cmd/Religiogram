import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type {
  JwtPayload,
  AuthenticatedUser,
} from '../interfaces/jwt-payload.interface';

/**
 * Dedicated strategy for /auth/refresh.
 * Pulls the token from the request body so we can distinguish clearly from access tokens
 * and additionally require the token payload's type === 'refresh'.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: (req: Request): string | null => {
        // P1-10 (v5): accept refresh token from httpOnly cookie OR body.
        // Body remains supported for backwards compat with old clients.
        // v7: try both __Secure- (prod) and bare rg_rt (dev). The setter chooses one or the other.
        type ReqWithCookies = Request & { cookies?: Record<string, string> };
        const r = req as ReqWithCookies;
        const fromCookie =
          r.cookies?.['__Secure-rg_rt'] ??
          r.cookies?.['rg_rt'] ??
          r.cookies?.['__Host-rg_rt'];   // legacy v6 cookie name during transition
        return (fromCookie as string | undefined) ?? (req?.body?.refreshToken ?? null);
      },
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.privateKey'),
      algorithms: ['HS256'],
      issuer: config.get<string>('jwt.issuer'),
      audience: config.get<string>('jwt.audience'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Expected refresh token');
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
