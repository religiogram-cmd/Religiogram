import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import { SMS_QUEUE, SMS_JOB, type SendOtpJobData } from './sms.queue.constants';
import { CostLockService } from '../common/cost-lock/cost-lock.service';

/**
 * OTP Service â€” HMAC-SHA256 (NOT bcrypt).
 *
 * Why HMAC instead of bcrypt here:
 *   - OTP lives only 5 minutes. Slow hashing buys us nothing.
 *   - HMAC-SHA256 is ~1000x faster (~20us vs ~100ms per verify).
 *   - At 5,000 OTP verifies/sec, bcrypt needs 500 cores; HMAC needs 0.1.
 *   - With rate limiting (max 5 attempts per OTP, IP + phone throttling),
 *     brute force is impossible regardless of hash algorithm.
 *
 * Security properties:
 *   - Server-side secret key (OTP_SECRET) â€” attacker with DB dump cannot forge
 *   - timingSafeEqual â€” constant-time comparison
 *   - Secret rotates with key rotation; old OTPs auto-expire via TTL
 *
 * Redis keys:
 *   otp:{phone}            => HMAC digest (hex), TTL 5 min
 *   otp:attempts:{phone}   => attempt counter, TTL 5 min
 *   otp:cooldown:{phone}   => "1", TTL 30s â€” blocks rapid resends
 *   otp:daily:{phone}      => send counter, TTL until midnight UTC â€” SMS bill protection
 *
 * SMS delivery:
 *   SMS is dispatched via BullMQ (async) instead of a blocking HTTP call.
 *   The OTP is stored in Redis atomically first, then the job is enqueued.
 *   The HTTP response returns before MSG91 is even called. SmsProcessor
 *   handles retries with exponential backoff on failure.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly OTP_LENGTH: number;
  private readonly OTP_TTL_SEC: number;
  private readonly MAX_ATTEMPTS: number;
  private readonly RESEND_COOLDOWN_SEC: number;
  private readonly OTP_SECRET: string;
  /** Maximum OTP sends per phone per calendar day (UTC). Prevents marketing-blast bills. */
  private readonly SMS_DAILY_CEILING: number;
  /** Maximum OTP sends per phone per clock hour. Hard floor: 5/hour. */
  private readonly SMS_HOURLY_CEILING: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectQueue(SMS_QUEUE) private readonly smsQueue: Queue<SendOtpJobData>,
    private readonly costLock: CostLockService,
  ) {
    this.OTP_LENGTH = this.config.get<number>('otp.length', 6);
    this.OTP_TTL_SEC = this.config.get<number>('otp.ttl', 300);
    this.MAX_ATTEMPTS = this.config.get<number>('otp.maxAttempts', 5);
    this.RESEND_COOLDOWN_SEC = this.config.get<number>('otp.resendCooldown', 30);
    this.OTP_SECRET = this.config.getOrThrow<string>('otp.secret');
    if (this.OTP_SECRET.length < 32) {
      // Startup assertion â€” fail loudly before accepting any traffic
      throw new Error(
        'OTP_SECRET must be at least 32 chars. Use a cryptographically-random key.',
      );
    }
    // Plan Â§8: 3 OTPs/user/day, 5/hour. Default keeps a small buffer for genuine
    // login retries while blocking SMS-blast abuse and WhatsApp billing runaway.
    this.SMS_DAILY_CEILING = this.config.get<number>('otp.smsDailyCeiling', 3);
    this.SMS_HOURLY_CEILING = this.config.get<number>('otp.smsHourlyCeiling', 5);
  }

  async generateAndSend(phone: string): Promise<void> {
    // â”€â”€ Global OTP cost lock (P0-5) â€” hard daily budget ceiling â”€â”€
    // When total daily OTP spend reaches COST_LOCK_OTP_DAILY_RUPEES, no more OTPs
    // are sent until midnight UTC. This prevents a botnet attack from burning
    // the monthly WhatsApp budget in a single day.
    const otpLocked = await this.costLock.isOtpLocked();
    if (otpLocked) {
      this.logger.error(`OTP cost lock active â€” daily budget reached. Blocking send to ***${phone.slice(-4)}`);
      throw new TooManyRequestsException(
        'OTP service is temporarily unavailable. Please try again tomorrow.',
      );
    }

    // â”€â”€ Per-user hourly SMS ceiling (plan Â§8: 5/hour) â”€â”€
    // Atomic Lua script: INCR + conditional EXPIRE in a single round-trip.
    // Two-command INCR+EXPIRE is a race: if the process dies between them,
    // the key has no TTL and rate-limits never reset. Lua is atomic on Redis.
    const hourlyKey = this.hourlyKey(phone);
    const luaHourly = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const hourlyCount = await this.redis.getClient().eval(luaHourly, 1, hourlyKey, '3600') as number;
    if (hourlyCount > this.SMS_HOURLY_CEILING) {
      this.logger.warn(
        `SMS hourly ceiling (${this.SMS_HOURLY_CEILING}) hit for ***${phone.slice(-4)}`,
      );
      throw new TooManyRequestsException(
        'Too many OTP requests this hour. Please try again later.',
      );
    }

    // â”€â”€ Per-user daily SMS ceiling â€” defence against marketing-blast bills â”€â”€
    // Each calendar day (UTC) a phone number can receive at most SMS_DAILY_CEILING OTPs.
    // Counter expires at the next midnight UTC so it resets cleanly every 24 hours.
    const dailyKey = this.dailyKey(phone);
    const dailyCount = await this.redis.incr(dailyKey);
    if (dailyCount === 1) {
      // First send today â€” set TTL to expire at next midnight UTC
      const now = new Date();
      const midnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
      const ttlSec = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
      await this.redis.expire(dailyKey, ttlSec);
    }
    if (dailyCount > this.SMS_DAILY_CEILING) {
      this.logger.warn(
        `SMS daily ceiling (${this.SMS_DAILY_CEILING}) hit for ***${phone.slice(-4)}`,
      );
      throw new TooManyRequestsException(
        `You have reached the daily OTP limit. Please try again tomorrow.`,
      );
    }

    // â”€â”€ Per-send resend cooldown (30 s default) â”€â”€
    const cooldownKey = this.cooldownKey(phone);
    const inCooldown = await this.redis.get(cooldownKey);
    if (inCooldown) {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new TooManyRequestsException(
        `Please wait ${ttl}s before requesting a new OTP`,
      );
    }

    const otp = this.generateOtp();
    const digest = this.hmac(phone, otp);

    // Store OTP + reset attempts + set cooldown in a single round trip.
    // A previously-valid OTP for this phone is overwritten â€” this is intended
    // so legitimate re-sends invalidate the prior code.
    const results = await this.redis
      .pipeline()
      .set(this.otpKey(phone), digest, 'EX', this.OTP_TTL_SEC)
      .set(this.attemptsKey(phone), '0', 'EX', this.OTP_TTL_SEC)
      .set(cooldownKey, '1', 'EX', this.RESEND_COOLDOWN_SEC)
      .exec();

    // ioredis returns an array of [err, result] tuples; surface the first error
    // so we don't silently enqueue an SMS for an OTP that was never stored.
    const pipelineError = results?.find(([err]: [unknown, unknown]) => err)?.[0];
    if (pipelineError) {
      // P1-8 (v4): refund the daily + hourly counters so a Redis hiccup
      // doesn't burn the user's allowance.
      try { await this.redis.incrby(this.dailyKey(phone), -1); } catch { /* best-effort */ }
      try { await this.redis.incrby(this.hourlyKey(phone), -1); } catch { /* best-effort */ }
      this.logger.error(
        `Redis pipeline failed while storing OTP for ***${phone.slice(-4)}: ${pipelineError.message}`,
      );
      throw new BadRequestException('Unable to generate OTP at the moment. Please try again.');
    }

    // Enqueue SMS job instead of blocking the request thread.
    // The HTTP response returns immediately; SmsProcessor calls MSG91 in the
    // background with 3 retry attempts and exponential backoff on failure.
    await this.smsQueue.add(
      SMS_JOB.SEND_OTP,
      { phone, otp },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 500, age: 24 * 3600 },
        // De-duplicate rapid resends within the cooldown window using the
        // phone as the jobId â€” BullMQ silently drops a duplicate add().
        // P1-9 (v4): jobId is the phone alone so BullMQ actually dedups
        // rapid resends within the cooldown window.
        jobId: `otp_${phone}`,
      },
    );

    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[DEV] OTP for ${phone} = ${otp}`);
    }
  }

  async verify(phone: string, presented: string): Promise<void> {
    // P3: k6 load-test bypass â€” accept the magic OTP '000000' in non-production
    // environments only. This lets load-test VUs skip Redis OTP lookup so SMS
    // spend is zero during perf runs. Never honoured in production.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'staging' &&
      presented === '000000' &&
      process.env.DEV_OTP_BYPASS === '1'
    ) {
      return; // bypass: treat as verified
    }

    const attemptsKey = this.attemptsKey(phone);
    const otpKey = this.otpKey(phone);

    const storedDigest = await this.redis.get(otpKey);
    if (!storedDigest) {
      throw new BadRequestException('OTP expired or not requested');
    }

    // Atomic INCR is the gate â€” prevents N parallel verifies from each
    // squeezing under MAX_ATTEMPTS before any increment lands.
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, this.OTP_TTL_SEC);
    }

    if (attempts > this.MAX_ATTEMPTS) {
      await this.redis.del(otpKey, attemptsKey);
      throw new TooManyRequestsException(
        'Too many invalid attempts. Please request a new OTP.',
      );
    }

    const presentedDigest = this.hmac(phone, presented);
    const match = this.safeEqual(presentedDigest, storedDigest);

    if (!match) {
      const remaining = Math.max(0, this.MAX_ATTEMPTS - attempts);
      throw new UnauthorizedException(
        `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    await this.redis.del(otpKey, attemptsKey);
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  /** Cryptographically-random N-digit numeric OTP (never Math.random). */
  private generateOtp(): string {
    const max = 10 ** this.OTP_LENGTH;
    const n = randomInt(0, max);
    return n.toString().padStart(this.OTP_LENGTH, '0');
  }

  /** Keyed HMAC-SHA256; phone is included so an OTP can't be replayed against another number. */
  private hmac(phone: string, otp: string): string {
    return createHmac('sha256', this.OTP_SECRET)
      .update(`${phone}:${otp}`)
      .digest('hex');
  }

  /** Constant-time comparison. Both inputs are already hex so Buffer.from is safe. */
  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    try {
      return timingSafeEqual(ab, bb);
    } catch {
      return false;
    }
  }

  private otpKey(phone: string): string {
    return `otp:code:${phone}`;
  }

  private attemptsKey(phone: string): string {
    return `otp:attempts:${phone}`;
  }

  private cooldownKey(phone: string): string {
    return `otp:cooldown:${phone}`;
  }

  private dailyKey(phone: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `otp:daily:${date}:${phone}`;
  }

  private hourlyKey(phone: string): string {
    const dt = new Date().toISOString().slice(0, 13);
    return `otp:hourly:${dt}:${phone}`;
  }
}

