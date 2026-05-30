import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';

/**
 * v7 (P0-NEW-4 fix): GoogleOAuthGuard now binds an HMAC `state` per request.
 *
 * Flow:
 *   1. /auth/google: the controller method `googleAuth()` is essentially a
 *      no-op; this guard does the heavy lifting. We mint a random nonce,
 *      stash it in the short-lived `rg_oauth_nonce` httpOnly cookie, and
 *      pass `state = HMAC(nonce, OTP_SECRET)` into passport's authorisation
 *      URL via `getAuthenticateOptions()`.
 *
 *   2. /auth/google/callback: this same guard handles the return. The
 *      AuthController then recomputes `HMAC(cookie-nonce)` and compares
 *      against `req.query.state`. Mismatch → 401.
 *
 *   `OAUTH_STATE_CHECK=off` lets you bypass the verifier in the controller,
 *   useful only for a one-time migration window.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  /** Called by passport before redirecting to Google. We hook in to set the cookie + state. */
  getAuthenticateOptions(context: ExecutionContext): Record<string, unknown> {
    const req = context.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    const res = context.switchToHttp().getResponse<Response>();

    // Only mint a new nonce on the OUTBOUND redirect, not on the callback.
    if (req.path?.endsWith('/auth/google') && !req.path.endsWith('/callback')) {
      const { randomBytes } = require('crypto') as typeof import('crypto');
      const nonce = randomBytes(16).toString('hex');
      const isProd = process.env.NODE_ENV === 'production';
      // v9 (B-NEW-1 fix): scope the nonce cookie to the OAuth flow only.
      // Both '/v1/auth/google' and '/v1/auth/google/callback' share the
      // '/v1/auth/google' prefix, so this works without widening to '/'.
      res.cookie('rg_oauth_nonce', nonce, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax', // 'lax' so cross-site OAuth redirect carries the cookie back
        path: '/v1/auth/google',
        maxAge: 5 * 60 * 1000,
      });
      const secret = this.config.get<string>('otp.secret', '');
      const state = createHmac('sha256', secret).update(nonce).digest('hex').slice(0, 32);
      return { state };
    }
    return {};
  }
}
