import { ForbiddenException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * v9 (P1-3 fix): CSRF double-submit middleware.
 *
 * The backend sets an `rg_csrf` cookie alongside the refresh cookie on every
 * successful login / token refresh. The frontend (lib/api.ts) reads the
 * cookie and echoes its value in the `X-CSRF-Token` header on every mutating
 * request. This middleware compares cookie ↔ header with a timing-safe
 * equality check and rejects mismatches with 403.
 *
 * Scope:
 *   - applied globally to POST / PUT / PATCH / DELETE
 *   - exempt: the bootstrap auth endpoints (send-otp, verify-otp, login,
 *     register, refresh, google) because the user has no CSRF cookie yet
 *   - exempt: webhook endpoints (Razorpay), which authenticate via HMAC
 *   - exempt: routes carrying Authorization: Bearer when in
 *     `mode=optional` — for native apps / curl clients that don't ride
 *     cookies. Browser sessions ALWAYS require CSRF because the bearer
 *     token alone is not sufficient when SameSite is bypassed via redirect.
 *
 * Disabled entirely when CSRF_ENABLED=false (escape hatch for staging).
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);
  private readonly enabled: boolean;
  private readonly exemptPathPrefixes: string[];

  constructor(private readonly config: ConfigService) {
    // Default ON in all environments. Operator must explicitly disable.
    this.enabled = this.config.get<string>('security.csrfEnabled', 'true') !== 'false';
    this.exemptPathPrefixes = [
      '/v1/auth/send-otp',
      '/v1/auth/verify-otp',
      '/v1/auth/login',
      '/v1/auth/register',
      '/v1/auth/refresh', // refresh itself uses its own CSRF check (see auth.controller)
      '/v1/auth/google',
      '/v1/payments/webhook', // Razorpay HMAC
      '/v1/health',
      '/v1/metrics',
    ];
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.enabled) return next();

    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    const path = req.path ?? '';
    if (this.exemptPathPrefixes.some((p) => path.startsWith(p))) {
      return next();
    }

    // v10 (P1-B): browser sessions ALWAYS have cookies. A Bearer-without-cookie
    // request is genuinely a native app / CLI client and we allow it as
    // before. But if the request carries a Bearer AND has cookies present
    // AND lacks the CSRF double-submit pair, we treat it as a browser session
    // with a missing/stripped CSRF cookie and reject (CSRF_COOKIE_MISSING) —
    // this closes the v9.1 P1-B bypass where same-origin JS could omit
    // credentials and skip the CSRF check.
    const hasAnyCookie = Boolean(req.headers.cookie);
    const hasBearer = (req.headers.authorization ?? '').startsWith('Bearer ');
    if (!hasAnyCookie && !hasBearer) return next();   // truly anonymous; let downstream auth decide
    if (!hasAnyCookie && hasBearer) return next();    // native app / CLI — no CSRF needed

    const cookieToken = (req as any).cookies?.rg_csrf as string | undefined;
    const headerToken = req.headers['x-csrf-token'];

    if (hasBearer && !cookieToken) {
      // Browser session with cookies but the rg_csrf cookie is missing.
      // Either a stripped-cookie attack or a JS bug. Either way: reject.
      this.logger.warn(`CSRF reject: bearer without rg_csrf cookie ${method} ${path}`);
      throw new ForbiddenException({
        code: 'CSRF_COOKIE_MISSING',
        message: 'Browser sessions must carry the rg_csrf cookie. Re-authenticate to refresh it.',
      });
    }

    if (!cookieToken || typeof headerToken !== 'string') {
      this.logger.warn(`CSRF reject: missing token ${method} ${path}`);
      throw new ForbiddenException({
        code: 'CSRF_REQUIRED',
        message: 'CSRF token is required for this request.',
      });
    }

    try {
      const a = Buffer.from(cookieToken);
      const b = Buffer.from(headerToken);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        this.logger.warn(`CSRF reject: mismatch ${method} ${path}`);
        throw new ForbiddenException({
          code: 'CSRF_MISMATCH',
          message: 'CSRF token did not match.',
        });
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'CSRF token is invalid.',
      });
    }

    next();
  }
}
