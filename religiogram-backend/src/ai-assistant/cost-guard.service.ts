import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AiUsageDaily } from './entities/ai-usage-daily.entity';
import { RedisService } from '../redis/redis.service';

// Section 11.1 — Free tier daily limits per action
const FREE_LIMITS: Record<string, number> = {
  chat:  20,
  voice: 5,
  image: 3,
  kundli: 1,
  compat: 1,
};
const PREMIUM_LIMIT = 999_999;

/**
 * P2-3: Per-user daily token ceilings.
 *
 * Each user can consume at most this many tokens per day before requests are
 * throttled. Free and Premium users share the same per-user floor; the global
 * budget ceiling (CostLockService) provides the system-wide hard stop.
 *
 * Values chosen so a single aggressive user cannot exhaust > ~5% of the global
 * daily AI budget while still comfortably covering legitimate use.
 */
const TOKEN_CEILING_FLASH_FREE = 50_000;    // Gemini Flash tokens/user/day (free)
const TOKEN_CEILING_FLASH_PREMIUM = 200_000; // Premium users get 4× headroom
const TOKEN_CEILING_PRO_FREE = 5_000;        // Gemini Pro tokens/user/day (free)
const TOKEN_CEILING_PRO_PREMIUM = 20_000;    // Premium users get 4× headroom

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  isPremium: boolean;
}

export interface TokenQuotaResult {
  allowed: boolean;
  usedTokens: number;
  limitTokens: number;
  used: number;
  limit: number;
  model: 'flash' | 'pro';
  isPremium: boolean;
}

@Injectable()
export class CostGuardService {
  private readonly logger = new Logger(CostGuardService.name);

  constructor(
    @InjectRepository(AiUsageDaily)
    private readonly usageRepo: Repository<AiUsageDaily>,
    private readonly redis: RedisService,
  ) {}

  private quotaKey(userId: string, action: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `rg-ai:quota:${userId}:${date}:${action}`;
  }

  /**
   * AI3 — Cost-guard: GET → check → INCR only if allowed.
   *
   * Bug: The old implementation called INCR unconditionally before checking the
   * limit. A blocked request (allowed=false) still consumed quota, so a burst of
   * denied requests could drain a legitimate user's daily allowance.
   *
   * Fix: Read the current count first (GET). If the user is already at or above
   * the limit, return allowed=false immediately without touching the counter.
   * Only increment when the request is actually going to proceed.
   *
   * Note: There is a small TOCTOU window between GET and INCR. Under concurrent
   * load a user could briefly exceed the limit by the number of parallel
   * in-flight requests. This is acceptable — the ceiling is a soft spend guard,
   * not a hard security limit, and the window is bounded by request concurrency
   * (typically 1–3 for a single user).
   */
  async checkAndIncrement(
    userId: string,
    action = 'chat',
    isPremium = false,
  ): Promise<QuotaResult> {
    const limit = isPremium ? PREMIUM_LIMIT : (FREE_LIMITS[action] ?? FREE_LIMITS.chat);
    const key = this.quotaKey(userId, action);

    // Step 1: GET current count — do not increment yet.
    const raw = await this.redis.get(key);
    const current = raw ? parseInt(raw, 10) : 0;

    // Step 2: Check before paying.
    if (current >= limit) {
      return { allowed: false, used: current, limit, isPremium };
    }

    // Step 3: Allowed — atomically increment.
    const next = await this.redis.incr(key);
    if (next === 1) {
      // First use today — set TTL so the key expires at midnight.
      await this.redis.expire(key, this.secondsUntilMidnight());
    }

    this.persistUsage(userId, action, next, isPremium).catch(e =>
      this.logger.warn('Usage persist failed', e?.message),
    );

    return { allowed: true, used: next, limit, isPremium };
  }

  async getQuota(
    userId: string,
    action = 'chat',
    isPremium = false,
  ): Promise<QuotaResult> {
    const limit = isPremium ? PREMIUM_LIMIT : (FREE_LIMITS[action] ?? FREE_LIMITS.chat);
    const key = this.quotaKey(userId, action);
    const raw = await this.redis.get(key);
    const used = raw ? parseInt(raw, 10) : 0;
    return { allowed: used < limit, used, limit, isPremium };
  }

  /** Returns quota for all actions in one call (for the /ai/usage endpoint) */
  async getAllQuotas(userId: string, isPremium: boolean): Promise<Record<string, QuotaResult>> {
    const actions = Object.keys(FREE_LIMITS);
    const results: Record<string, QuotaResult> = {};
    await Promise.all(
      actions.map(async action => {
        results[action] = await this.getQuota(userId, action, isPremium);
      }),
    );
    return results;
  }

  /* ─────────────── Token-level per-user ceilings (P2-3) ─────────────── */

  private tokenKey(userId: string, model: 'flash' | 'pro'): string {
    const date = new Date().toISOString().slice(0, 10);
    return `rg-ai:tokens:${model}:${userId}:${date}`;
  }

  /**
   * Check whether the user is already over their daily token ceiling.
   * Call this BEFORE starting a streaming request.
   * Does NOT increment the counter — use `recordTokens()` after completion.
   */
  async checkTokenCeiling(
    userId: string,
    model: 'flash' | 'pro',
    isPremium: boolean,
  ): Promise<TokenQuotaResult> {
    const limit =
      model === 'flash'
        ? isPremium ? TOKEN_CEILING_FLASH_PREMIUM : TOKEN_CEILING_FLASH_FREE
        : isPremium ? TOKEN_CEILING_PRO_PREMIUM   : TOKEN_CEILING_PRO_FREE;

    const raw = await this.redis.get(this.tokenKey(userId, model));
    const usedTokens = raw ? parseInt(raw, 10) : 0;
    return { allowed: usedTokens < limit, usedTokens, limitTokens: limit, used: usedTokens, limit, model, isPremium };
  }

  /**
   * Record `tokens` consumed for the user after a response has completed.
   * Returns the updated ceiling check so the caller can surface throttling
   * info in the next request if the user has now crossed the threshold.
   */
  async recordTokens(
    userId: string,
    model: 'flash' | 'pro',
    tokens: number,
    isPremium: boolean,
  ): Promise<TokenQuotaResult> {
    if (tokens <= 0) return this.checkTokenCeiling(userId, model, isPremium);
    const ceiling =
      model === 'flash'
        ? isPremium ? TOKEN_CEILING_FLASH_PREMIUM : TOKEN_CEILING_FLASH_FREE
        : isPremium ? TOKEN_CEILING_PRO_PREMIUM   : TOKEN_CEILING_PRO_FREE;
    const key  = this.tokenKey(userId, model);
    const used = await this.redis.incrby(key, tokens);
    if (used === tokens) {
      // First write today — set 24-hour TTL
      await this.redis.expire(key, 86_400);
    }
    return { allowed: used <= ceiling, used, limit: ceiling, usedTokens: used, limitTokens: ceiling, model, isPremium };
  }

  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
  }

  private async persistUsage(
    userId: string,
    action: string,
    count: number,
    isPremium: boolean,
  ): Promise<void> {
    try {
      const date = new Date().toISOString().slice(0, 10);
      await this.usageRepo.upsert(
        { userId, action, date, count, isPremium },
        ['userId', 'action', 'date'],
      );
    } catch (err: any) {
      this.logger.warn('persistUsage failed', err?.message);
    }
  }

}
