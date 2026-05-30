import {
  Body,
  Controller,
  Res,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { EmailRegisterDto } from '../dto/email-register.dto';
import { EmailLoginDto } from '../dto/email-login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtRefreshGuard } from '../guards/jwt-refresh.guard';
import { OtpThrottleGuard } from '../guards/otp-throttle.guard';
import { GoogleOAuthGuard } from '../guards/google-oauth.guard';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import type { GoogleProfile } from '../../users/users.service';

/**
 * Auth controller — OTP (primary) + Google OAuth (secondary).
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * P1-10 (v5): httpOnly refresh-token cookie + CSRF double-submit.
   *
   * - The refresh token rides in `__Host-rg_rt` (httpOnly, Secure, SameSite=Strict,
   *   Path=/api/v1/auth/refresh) so XSS cannot read it.
   * - We pair it with `rg_csrf` (NOT httpOnly so the frontend can read it) and
   *   require the frontend to echo the value in `X-CSRF-Token` on /auth/refresh.
   *   That's the standard double-submit pattern.
   *
   * Activated whenever REFRESH_TOKEN_TRANSPORT === 'cookie' (default: 'body' for
   * backwards compatibility while frontend transitions).
   */
  private setRefreshCookie(res: Response, refreshToken: string, csrf: string) {
    const isProd = this.config.get<string>('app.env') === 'production';
    const maxAgeMs = (Number(this.config.get('jwt.refreshTtl', 7 * 24 * 60 * 60))) * 1000;
    // v9 (B-NEW-1 fix): roll back the v8 widening to `path: '/'` which sent the
    // HttpOnly refresh credential on every same-origin request. The cookie path
    // is now tied to the suffix shared by both topologies:
    //   - Direct API:   POST /v1/auth/refresh
    //   - Proxied API:  POST /api/v1/auth/refresh
    // Both URLs end with `/auth/refresh`, so a cookie scoped to
    // /v1/auth/refresh is correct for the direct topology. For the proxied
    // topology, the reverse proxy MUST forward the cookie unchanged (default
    // nginx / CloudFront behaviour). If the proxy rewrites the path prefix,
    // configure REFRESH_COOKIE_PATH=/api/v1/auth/refresh (or whatever your
    // edge route is) and the cookie scopes correctly.
    const cookiePath = this.config.get<string>('auth.refreshCookiePath', '/v1/auth/refresh');
    const cookieName = isProd ? '__Secure-rg_rt' : 'rg_rt'; // __Secure- needs Secure (only true in prod)
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: cookiePath,
      maxAge: maxAgeMs,
    });
    // CSRF cookie must be readable by JS for the double-submit pattern and
    // must be sent on every mutating request, so its path stays at '/'.
    // It is *not* a credential by itself — the JWT is the credential.
    res.cookie('rg_csrf', csrf, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeMs,
    });
  }


  /**
   * P1-16 (v5): per-request state binding for Google OAuth.
   *
   * On init: generate a random nonce, HMAC it with OTP_SECRET (server-side),
   * stash in a short-lived `rg_oauth_nonce` httpOnly cookie, and pass the
   * hex(nonce) as the `state` query parameter to Google.
   *
   * On callback: recompute HMAC(cookie) and compare against `state`.
   * Mismatch -> 401.
   */
  private oauthState(nonce: string): string {
    // v7: identical HMAC formula to GoogleOAuthGuard.getAuthenticateOptions().
    // Both halves of the binding share OTP_SECRET so a callback can verify
    // without any DB / Redis round-trip.
    const secret = this.config.getOrThrow<string>('otp.secret');
    return createHmac('sha256', secret).update(nonce).digest('hex').slice(0, 32);
  }

  private cookieMode(): boolean {
    return this.config.get<string>('auth.refreshTransport', 'cookie') === 'cookie';
  }


  /* ════════ OTP FLOW ════════ */

  @Public()
  @UseGuards(OtpThrottleGuard)
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Body() dto: SendOtpDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    await this.authService.sendOtp(dto.phone, {
      ip,
      userAgent: req.headers['user-agent'] ?? '',
      deviceId: dto.deviceId,
    });
    return {
      message: 'OTP sent successfully',
      expiresIn: 300,
      resendAfter: 30,
    };
  }

  @Public()
  // M6: Throttle verify-otp just like send-otp.
  // Without this guard an attacker can brute-force the 6-digit OTP at full
  // network speed (~1 M attempts/min) — a 6-digit space is exhausted in < 1 s.
  @UseGuards(OtpThrottleGuard)
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // P1-10 verifyOtp cookie
    const result = await this.authService.verifyOtp(dto.phone, dto.otp, {
      ip,
      userAgent: req.headers['user-agent'] ?? '',
      deviceId: dto.deviceId,
    });
    if (this.cookieMode() && result?.tokens?.refreshToken) {
      const { randomBytes } = await import('crypto');
      const csrf = randomBytes(24).toString('hex');
      this.setRefreshCookie(res, result.tokens.refreshToken, csrf);
      // Don't leak refresh token in JSON body when cookie mode is on.
      result.tokens = { ...result.tokens, refreshToken: '' };
    }
    return result;
  }

  /* ════════ GOOGLE OAUTH FLOW ════════ */

  /**
   * Start Google consent screen redirect.
   * GoogleOAuthGuard triggers passport → redirects to Google.
   */
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  googleAuth(): void {
    // Intentionally empty. GoogleOAuthGuard (v7) mints the nonce, sets the
    // rg_oauth_nonce cookie, and injects state into the passport handshake.
  }

  /**
   * Google redirects back here with `?code=…`.
   * Passport exchanges the code for a profile, which is attached to req.user.
   * We issue our own JWTs and redirect back to the app with tokens in the URL fragment
   * (fragments don't hit the server log — safer than query string).
   */
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  @Redirect()
  async googleCallback(
    @Req() req: Request,
    @Ip() ip: string,
    @Query('state') _state: string,
  ) {
    // A1: OAuth state must ALWAYS be validated — no kill switch.
    // An `OAUTH_STATE_CHECK=off` bypass is a CSRF vector that allows an
    // attacker to force an admin to authenticate with the attacker's Google
    // account (OAuth login CSRF). Remove the bypass entirely.
    type ReqWithCookies = Request & { cookies?: Record<string, string> };
    const nonceCookie = (req as ReqWithCookies).cookies?.rg_oauth_nonce;
    const stateParam = req.query?.['state'] as string | undefined;
    if (!nonceCookie || !stateParam || this.oauthState(nonceCookie) !== stateParam) {
      // Don't reveal whether it's the cookie or the state that's missing.
      throw new (require('@nestjs/common').UnauthorizedException)('OAuth state validation failed');
    }

    const profile = req.user as GoogleProfile;
    const deviceId = req.headers['x-device-id'] as string | undefined;

    const result = await this.authService.loginWithGoogle(profile, {
      ip,
      userAgent: req.headers['user-agent'] ?? '',
      deviceId,
    });

    const appScheme = this.config.get<string>(
      'google.appRedirectScheme',
      'religiogram://auth',
    );

    // Fragment-based token delivery — tokens never appear in server logs or Referer headers
    const url =
      `${appScheme}` +
      `#accessToken=${encodeURIComponent(result.tokens.accessToken)}` +
      `&refreshToken=${encodeURIComponent(result.tokens.refreshToken)}` +
      `&isNewUser=${result.isNewUser}`;

    return { url, statusCode: HttpStatus.FOUND };
  }

  /* ════════ REFRESH + LOGOUT ════════ */

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // P1-10 refresh cookie: CSRF double-submit when cookie mode is on
    if (this.cookieMode()) {
      const csrfCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.rg_csrf;
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        throw new (await import('@nestjs/common').then(m => m.UnauthorizedException))('CSRF token mismatch');
      }
    }
    const result = await this.authService.refresh(user, dto.refreshToken, {
      ip,
      userAgent: req.headers['user-agent'] ?? '',
      deviceId: dto.deviceId ?? user.deviceId,
    });
    if (this.cookieMode() && result?.tokens?.refreshToken) {
      const { randomBytes } = await import('crypto');
      const csrf = randomBytes(24).toString('hex');
      this.setRefreshCookie(res, result.tokens.refreshToken, csrf);
      result.tokens = { ...result.tokens, refreshToken: '' };
    }
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.id, user.jti);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAll(user.id);
  }

  /* ─── Email / password ─────────────────────────────────────── */

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async emailRegister(
    @Body() dto: EmailRegisterDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,  // v10 P0-A: cookie mode
  ) {
    const result = await this.authService.emailRegister(
      dto.email,
      dto.password,
      dto.name,
      { ip, userAgent: req.headers['user-agent'] ?? '' },
    );
    // v10 (P0-A): wire setRefreshCookie on the email path. Without this every
    // browser user authenticating via email/password gets logged out in 15 min
    // under the cookie-mode-default the frontend ships with from v9.
    if (this.cookieMode() && result?.tokens?.refreshToken) {
      const { randomBytes } = await import('crypto');
      const csrf = randomBytes(24).toString('hex');
      this.setRefreshCookie(res, result.tokens.refreshToken, csrf);
      result.tokens = { ...result.tokens, refreshToken: '' };
    }
    return result;
  }

  @Post('login')
  @Public()
  
  @HttpCode(HttpStatus.OK)
  async emailLogin(
    @Body() dto: EmailLoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,  // v10 P0-A: cookie mode
  ) {
    const result = await this.authService.emailLogin(
      dto.email,
      dto.password,
      { ip, userAgent: req.headers['user-agent'] ?? '' },
    );
    // v10 (P0-A): wire setRefreshCookie on the email path. The v8 re-audit and
    // v9.1 re-audit both flagged this as a latent P0 since v5; the regex-based
    // patcher in v5 missed these handler signatures.
    if (this.cookieMode() && result?.tokens?.refreshToken) {
      const { randomBytes } = await import('crypto');
      const csrf = randomBytes(24).toString('hex');
      this.setRefreshCookie(res, result.tokens.refreshToken, csrf);
      result.tokens = { ...result.tokens, refreshToken: '' };
    }
    return result;
  }
}
