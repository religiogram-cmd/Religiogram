import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';

/**
 * Dual-axis rate limiter for /auth/send-otp.
 * Blocks both:
 *   - Same phone requesting too fast (per-user abuse)
 *   - Same IP hammering many phones (scraper / botnet)
 *
 * Uses a Lua script so INCR + EXPIRE happen atomically in a single round-trip.
 * This avoids the classic race where a process crashes between INCR and
 * EXPIRE and leaves the counter key with no TTL (permanent Redis bloat +
 * a rate limit that never resets).
 */
/** Shared key helper — ensures guard throttle and OTP service use the same Redis key. */
export const otpThrottleKey = (phone: string): string => `rl:sendotp:phone:${phone}`;

@Injectable()
export class OtpThrottleGuard implements CanActivate {
  private readonly perPhoneLimit: number;
  private readonly perPhoneWindow = 300;
  private readonly perIpLimit: number;
  private readonly perIpWindow = 3600;

  /**
   * KEYS[1] = counter key
   * ARGV[1] = window TTL in seconds
   * Returns the current count after INCR.
   */
  private static readonly INCR_WITH_TTL_LUA = `
    local c = redis.call('INCR', KEYS[1])
    if c == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return c
  `;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.perPhoneLimit = this.config.get<number>('rateLimit.sendOtpPhone', 3);
    this.perIpLimit = this.config.get<number>('rateLimit.sendOtpIp', 10);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // Only treat phone as valid if it's a non-empty string — prevents a
    // type-confusion bypass where { "phone": null } or { "phone": 0 }
    // would skip the per-phone throttle.
    const phoneRaw = (req.body as Record<string, unknown> | undefined)?.phone;
    const phone = typeof phoneRaw === 'string' && phoneRaw.length > 0 ? phoneRaw : null;

    // req.ip trusts the X-Forwarded-For header only if `app.set('trust proxy')`
    // is configured in main.ts — otherwise we'd throttle the load balancer IP.
    const ip = this.clientIp(req);

    if (phone) {
      await this.incrementOrBlock(
        otpThrottleKey(phone),
        this.perPhoneLimit,
        this.perPhoneWindow,
        'Too many OTP requests for this number. Try again later.',
      );
    }

    await this.incrementOrBlock(
      `rl:sendotp:ip:${ip}`,
      this.perIpLimit,
      this.perIpWindow,
      'Too many requests from this network. Please try again later.',
    );

    return true;
  }

  private clientIp(req: Request): string {
    // Express `req.ip` already handles trust-proxy when configured. Fall back
    // to manual X-Forwarded-For parsing for safety.
    if (req.ip) return req.ip;
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') return xff.split(',')[0].trim();
    if (Array.isArray(xff) && xff.length) return xff[0];
    return req.socket?.remoteAddress ?? 'unknown';
  }

  private async incrementOrBlock(
    key: string,
    limit: number,
    windowSec: number,
    message: string,
  ): Promise<void> {
    const client = this.redis.getClient();
    const count = (await client.eval(
      OtpThrottleGuard.INCR_WITH_TTL_LUA,
      1,
      key,
      String(windowSec),
    )) as number;

    if (count > limit) {
      throw new TooManyRequestsException(message);
    }
  }
}
