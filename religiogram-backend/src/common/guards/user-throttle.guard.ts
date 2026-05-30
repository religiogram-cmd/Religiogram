import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';

export interface UserThrottleOptions {
  /** Maximum requests allowed within the window */
  limit: number;
  /** Rolling window in seconds */
  windowSec: number;
  /**
   * Human-readable name for this throttle rule — used in the error message
   * and the Redis key so different endpoints don't share buckets.
   * Defaults to the route path.
   */
  name?: string;
}

export const USER_THROTTLE_KEY = 'user_throttle';

/**
 * @UserThrottle(limit, windowSec, name?)
 *
 * Decorator — attach to a controller method to enforce a per-authenticated-user
 * rate limit backed by Redis.
 *
 * Usage:
 *   @UserThrottle(5, 60, 'create-booking')
 *   @Post()
 *   async createBooking(...) {}
 *
 * This complements the global IP-level ThrottlerGuard:
 *   • IP throttling:   blunt — catches bots and unauthenticated traffic
 *   • User throttling: precise — enforces business-logic limits per account
 *     (e.g. max 5 bookings/min, max 3 payment initiations/minute)
 *
 * The Redis key is:
 *   rg:user-throttle:{userId}:{name}:{windowBucket}
  * — true sliding window via Redis sorted set (no 2× burst at bucket boundary).
 */
import { SetMetadata } from '@nestjs/common';

export const UserThrottle = (
  limit: number,
  windowSec: number,
  name?: string,
): MethodDecorator =>
  SetMetadata(USER_THROTTLE_KEY, { limit, windowSec, name } satisfies UserThrottleOptions);

@Injectable()
export class UserThrottleGuard implements CanActivate {
  private readonly logger = new Logger(UserThrottleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<UserThrottleOptions | undefined>(
      USER_THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @UserThrottle on this route — pass through
    if (!opts) return true;

    const request = context.switchToHttp().getRequest();
    const user    = request.user as { id?: string } | undefined;

    // Unauthenticated request — let JwtAuthGuard handle the 401 downstream;
    // don't block it here.
    if (!user?.id) return true;

    const { limit, windowSec, name } = opts;
    const ruleName = name ?? context.getHandler().name;
    const now      = Date.now();
    const windowMs = windowSec * 1_000;
    // Sliding-window via sorted set — eliminates the 2× burst at fixed-bucket boundary.
    // Key stores one member per request (score = timestamp ms); expired members pruned atomically.
    const key = `user-throttle:${user.id}:${ruleName}`;
    const member = `${now}-${crypto.randomBytes(8).toString('hex')}`;

    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - windowMs);  // evict expired
    pipe.zadd(key, now, member);                    // record this request
    pipe.zcard(key);                                // count within window
    pipe.expire(key, windowSec + 1);               // auto-cleanup
    const results = await pipe.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > limit) {
      this.logger.warn(
        `User rate limit exceeded — userId=${user.id} rule=${ruleName} count=${count}/${limit} window=${windowSec}s`,
      );
      throw new HttpException(
        `Too many requests — you may make at most ${limit} ${ruleName} request(s) per ${windowSec} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
