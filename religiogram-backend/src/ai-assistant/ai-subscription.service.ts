import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

const PREMIUM_TTL_SECONDS = 2_764_800; // 32 days — covers 30-day billing cycle with buffer

@Injectable()
export class AiSubscriptionService {
  private readonly logger = new Logger(AiSubscriptionService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private cacheKey(userId: string): string {
    return `rg-ai:premium:${userId}`;
  }

  /**
   * Returns true if the user has an active AI Premium subscription in Redis.
   * Phase 2 will add a live Razorpay subscription status check as a fallback.
   */
  async isPremium(userId: string): Promise<boolean> {
    return this.redis.exists(this.cacheKey(userId));
  }

  /**
   * Marks a user as premium for 32 days (enough to cover one billing cycle + buffer).
   * Called after a successful Razorpay subscription webhook.
   */
  async activatePremium(userId: string): Promise<void> {
    await this.redis.setEx(this.cacheKey(userId), PREMIUM_TTL_SECONDS, '1');
    this.logger.log(`Premium activated for user ${userId} — TTL ${PREMIUM_TTL_SECONDS}s`);
  }

  /**
   * Removes premium status immediately (e.g. cancellation webhook).
   */
  async deactivatePremium(userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(userId));
    this.logger.log(`Premium deactivated for user ${userId}`);
  }

  /**
   * Creates a Razorpay subscription for Rs.49/month AI Premium.
   * Returns the subscription ID and hosted short URL for the checkout page.
   */
  async createSubscription(
    userId: string,
  ): Promise<{ subscriptionId: string; shortUrl: string }> {
    const keyId     = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    const planId    = this.configService.get<string>('RAZORPAY_AI_PLAN_ID');

    if (!keyId || !keySecret || !planId) {
      throw new HttpException(
        'Payment gateway not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const Razorpay = (await import('razorpay') as any).default;
      const client = new Razorpay({ key_id: keyId, key_secret: keySecret });

      const sub = await client.subscriptions.create({
        plan_id:     planId,
        total_count: 12,   // 12 months auto-renew
        quantity:    1,
        notes: {
          userId,
          product: 'rg-ai-premium',
        },
      });

      this.logger.log(`Razorpay subscription ${sub.id} created for user ${userId}`);
      return { subscriptionId: sub.id, shortUrl: sub.short_url };
    } catch (err: any) {
      this.logger.error(`Razorpay subscription creation failed for user ${userId}`, err?.message);
      throw new HttpException(
        err?.error?.description ?? 'Failed to create subscription',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
