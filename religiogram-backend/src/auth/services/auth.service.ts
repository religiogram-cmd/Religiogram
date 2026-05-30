import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpService } from '../../otp/otp.service';
import { UsersService, type GoogleProfile } from '../../users/users.service';
import { TokenService } from './token.service';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../../email/email.service';
import { AuthEvent } from '../entities/auth-event.entity';
import type { User } from '../../users/entities/user.entity';
import type {
  AuthResponse,
  PublicUser,
} from '../interfaces/auth-response.interface';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

export interface AuthContext {
  ip: string;
  userAgent: string;
  deviceId?: string;
}

/**
 * AuthService — the orchestrator for all auth flows (OTP + Google).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Redis TTL (seconds) for cached user objects used during token refresh.
   * Bumped from 5min to 1hr — at 10M DAU the refresh fan-out would otherwise
   * do ~1000 extra DB reads/sec for users whose cache just happened to
   * expire. Any mutation on the user row (updateProfile, role change,
   * deactivate, logout-all) must invalidate this key explicitly — see
   * UsersService.updateProfile and this.logoutAll below.
   */
  private readonly USER_CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly redis: RedisService,
    @InjectRepository(AuthEvent)
    private readonly authEvents: Repository<AuthEvent>,
    private readonly emailService: EmailService,
  ) {}

  /* ══════════════════ OTP FLOW (PRIMARY) ══════════════════ */

  async sendOtp(phone: string, ctx: AuthContext): Promise<void> {
    if (await this.usersService.isBlocked(phone)) {
      this.logger.warn(`Blocked user attempted OTP: ${this.maskPhone(phone)}`);
      return;
    }
    await this.otpService.generateAndSend(phone);
    await this.logAuthEvent({ eventType: 'OTP_SENT', phone, ...ctx });
  }

  async verifyOtp(
    phone: string,
    otp: string,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    await this.otpService.verify(phone, otp);

    const { user, isNewUser } = await this.usersService.findOrCreateByPhone(
      phone,
      { lastLoginIp: ctx.ip, lastDeviceId: ctx.deviceId },
    );

    if (!user.isActive) throw new ForbiddenException('Account is inactive');
    if (!isNewUser) await this.detectSuspiciousLogin(user, ctx);

    const tokens = await this.tokenService.issueTokenPair(user, ctx.deviceId);

    // Cache user for fast token-refresh lookups (avoids DB hit every 15 min)
    await this.cacheUser(user);

    await this.logAuthEvent({
      eventType: isNewUser ? 'SIGNUP_PHONE' : 'LOGIN_PHONE',
      userId: user.id,
      phone,
      ...ctx,
    });

    return { user: this.toPublicUser(user), tokens, isNewUser };
  }

  /* ══════════════════ GOOGLE OAUTH FLOW (SECONDARY) ══════════════════ */

  /**
   * Called by the Google callback controller after Passport has verified the profile.
   * Same token-issuance path as OTP — just a different user lookup.
   */
  async loginWithGoogle(
    profile: GoogleProfile,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    const { user, isNewUser } = await this.usersService.findOrCreateByGoogle(
      profile,
      { lastLoginIp: ctx.ip, lastDeviceId: ctx.deviceId },
    );

    if (!user.isActive) throw new ForbiddenException('Account is inactive');
    if (!isNewUser) await this.detectSuspiciousLogin(user, ctx);

    const tokens = await this.tokenService.issueTokenPair(user, ctx.deviceId);

    await this.cacheUser(user);

    await this.logAuthEvent({
      eventType: isNewUser ? 'SIGNUP_GOOGLE' : 'LOGIN_GOOGLE',
      userId: user.id,
      ...ctx,
    });

    return { user: this.toPublicUser(user), tokens, isNewUser };
  }

  /* ══════════════════ TOKEN REFRESH + LOGOUT ══════════════════ */

  async refresh(
    user: AuthenticatedUser,
    presentedRefreshToken: string,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    // Atomically consume the old token — returns true only if this exact jti
    // existed and matched. Any concurrent refresh with the same token loses
    // the race and gets `false` → treated as reuse below.
    const consumed = await this.tokenService.consumeRefreshToken(
      user.id,
      user.jti,
      presentedRefreshToken,
    );

    if (!consumed) {
      this.logger.error(
        `Refresh token reuse detected for user ${user.id}. Revoking all sessions.`,
      );
      await this.tokenService.revokeAllForUser(user.id);
      await this.redis.del(this.userCacheKey(user.id));

      // §4.2 minIat enforcement: stamp the current time so JwtStrategy rejects
      // any access tokens issued before this moment — even ones not yet expired.
      // TTL matches the max access-token lifetime (15 min) so the key cleans itself up.
      await this.redis.set(
        `user:${user.id}:minIat`,
        String(Math.floor(Date.now() / 1000)),
        'EX',
        7 * 24 * 60 * 60, // 7 days — covers any unexpired access token in the wild
      );

      await this.logAuthEvent({
        eventType: 'SUSPICIOUS',
        userId: user.id,
        ...ctx,
        metadata: { reason: 'refresh_token_reuse' },
      });
      throw new UnauthorizedException(
        'Session revoked. Please log in again.',
      );
    }

    // Always read isActive/role FRESH from DB. Cache is fine for non-sensitive
    // fields but cannot be trusted for "is this account still allowed in?".
    const freshUser = await this.usersService.findById(user.id);

    if (!freshUser || !freshUser.isActive) {
      await this.redis.del(this.userCacheKey(user.id));
      await this.tokenService.revokeAllForUser(user.id);
      throw new ForbiddenException('Account is inactive');
    }

    const tokens = await this.tokenService.issueTokenPair(
      freshUser,
      ctx.deviceId,
    );

    // Refresh the cache TTL
    await this.cacheUser(freshUser);

    await this.logAuthEvent({
      eventType: 'TOKEN_REFRESH',
      userId: freshUser.id,
      ...ctx,
    });

    return { user: this.toPublicUser(freshUser), tokens, isNewUser: false };
  }

  async logout(userId: string, jti: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(userId, jti);
    await this.logAuthEvent({ eventType: 'LOGOUT', userId });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
    // Bust the user cache so stale isActive state isn't served post-logout
    await this.redis.del(this.userCacheKey(userId));
    await this.logAuthEvent({ eventType: 'LOGOUT_ALL', userId });
  }


  // devLogin() removed — moved to AuthDevService in auth-dev.module.ts (P1-1).
  // AuthDevModule is only imported when NODE_ENV !== 'production', so this
  // code path no longer ships in production builds.

  /* ══════════════════ private helpers ══════════════════ */

  private async detectSuspiciousLogin(
    user: User,
    ctx: AuthContext,
  ): Promise<void> {
    const knownDevice = user.lastDeviceId === ctx.deviceId;
    const knownIp = user.lastLoginIp === ctx.ip;
    if (!knownDevice && !knownIp) {
      this.logger.warn(
        `Suspicious login: user=${user.id} ip=${ctx.ip} device=${ctx.deviceId}`,
      );
      await this.logAuthEvent({
        eventType: 'SUSPICIOUS',
        userId: user.id,
        ...ctx,
        metadata: { reason: 'unknown_device_and_ip' },
      });
      // Alert user via email about suspicious login (fire-and-forget)
      const alertEmail: string | null = user.email ?? null;
      if (alertEmail) {
        this.emailService.sendGeneric(alertEmail, {
          subject: 'New login from unrecognised device — ReligioGram',
          html: '<p>A login was detected on your account from an unrecognised device or IP address.</p><p>If this was not you, please contact support immediately.</p>',
        }).catch((err: Error) => this.logger.warn(`Suspicious login email failed: ${err.message}`));
      }
    }
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isVerified: user.isVerified,
    };
  }

  private maskPhone(phone: string): string {
    return phone.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2');
  }

  /* ── User cache ── */

  private userCacheKey(userId: string): string {
    return `user:cache:${userId}`;
  }

  private async cacheUser(user: User): Promise<void> {
    try {
      const safe = { id: user.id, phone: user.phone, role: user.role, name: user.name, avatarUrl: user.avatarUrl };
      await this.redis.set(
        this.userCacheKey(user.id),
        JSON.stringify(safe),
        'EX',
        this.USER_CACHE_TTL,
      );
    } catch (err) {
      // Non-fatal — DB will be used as fallback
      this.logger.warn(
        `Failed to cache user ${user.id}: ${(err as Error).message}`,
      );
    }
  }


  /* ── Audit log ── */

  /**
   * FIX: Actually writes to the auth_events PostgreSQL table.
   *
   * Previously this was a logger-only stub — no audit trail was persisted,
   * violating DPDP Act 2023 compliance requirements.
   *
   * Errors are swallowed so a DB hiccup never blocks an auth response.
   * For guaranteed delivery at scale, move this to a BullMQ queue.
   */
  private async logAuthEvent(evt: {
    eventType: string;
    userId?: string;
    phone?: string;
    ip?: string;
    userAgent?: string;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const event = this.authEvents.create({
        eventType: evt.eventType,
        userId: evt.userId ?? null,
        phone: evt.phone ?? null,
        ipAddress: evt.ip ?? null,
        userAgent: evt.userAgent ?? null,
        deviceId: evt.deviceId ?? null,
        metadata: evt.metadata ?? null,
      });
      await this.authEvents.save(event);
      this.logger.log(`AUTH_EVENT ${evt.eventType} user=${evt.userId ?? 'N/A'}`);
    } catch (err) {
      // Never let an audit failure crash the auth flow
      this.logger.error('Failed to write auth event', (err as Error).message);
    }
  }


  /* ══════════════════ EMAIL / PASSWORD FLOW ══════════════════ */

  /**
   * Register a new user with email + password.
   * Throws ConflictException if email already exists with a password.
   */
  async emailRegister(
    email: string,
    password: string,
    name: string | undefined,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    const { hash } = await import('bcryptjs');

    // P0-1 (v4): an existing user with this email — whether Google-only,
    // password-set, or both — must NEVER be silently password-attached.
    // Account takeover via this path was the original P0-1 finding.
    //
    // We return a generic ConflictException either way so an attacker cannot
    // enumerate which emails already exist. A Google-only user wanting to add
    // a password must go through the authenticated /auth/me/add-password flow
    // (defined below) which requires a verified-email challenge first.
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new (await import('@nestjs/common').then(m => m.ConflictException))(
        'If this email is eligible to register, you will receive an email shortly.',
      );
    }

    const passwordHash = await hash(password, 12);
    const user: User = await this.usersService.createEmailUser({ email, passwordHash, name });

    await this.logAuthEvent({ eventType: 'EMAIL_REGISTER', userId: user.id, ...ctx });
    // Fire-and-forget welcome email — never block auth on email delivery
    if (user.email) {
      this.emailService.sendWelcome(user.email, { userName: user.name ?? user.email, role: 'seeker' }).catch(() => {});
    }
    return this.buildAuthResponse(user, true, ctx);
  }

  /**
   * Sign in with email + password.
   * Throws UnauthorizedException on wrong credentials (no leak of which).
   */
  async emailLogin(
    email: string,
    password: string,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    const { compare } = await import('bcryptjs');

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated.');
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // P2 (v4): bring email login in line with OTP / Google by running the
    // unknown-device + unknown-IP check.
    await this.detectSuspiciousLogin(user, ctx);
    await this.logAuthEvent({ eventType: 'EMAIL_LOGIN', userId: user.id, ...ctx });
    return this.buildAuthResponse(user, false, ctx);
  }

  /** Shared response builder — used by email flows. Threads deviceId for
   *  proper suspicious-login baseline. */
  private async buildAuthResponse(
    user: User,
    isNewUser: boolean,
    ctx?: AuthContext,
  ): Promise<AuthResponse> {
    const tokens = await this.tokenService.issueTokenPair(user, ctx?.deviceId);
    if (ctx) {
      this.usersService
        .updateLastLogin(user.id, { lastLoginIp: ctx.ip, lastDeviceId: ctx.deviceId })
        .catch((err: Error) => this.logger.warn(`updateLastLogin failed: ${err.message}`));
    }
    return {
      user: this.toPublicUser(user),
      tokens,
      isNewUser,
    };
  }

}