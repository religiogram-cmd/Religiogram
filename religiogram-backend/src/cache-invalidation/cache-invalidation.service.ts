import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../redis/redis-cache.service';
import { RedisService } from '../redis/redis.service';

/**
 * CacheInvalidationService — §81 Cache Strategy / S7 fix
 *
 * Event-driven cache invalidation. All mutation services call
 * invalidate() after writes. Keys are namespaced so pattern-based
 * deletion is safe.
 *
 * S7 FIX: Previously injected RedisService (keyPrefix 'rg:') and passed
 * 'rg:cache:xxx' keys → actual Redis key became 'rg:rg:cache:xxx' (double
 * prefixed, never matching what RedisCacheService stored).
 *
 * Now uses RedisCacheService (keyPrefix 'rg:cache:') directly, passing keys
 * WITHOUT the 'rg:cache:' prefix so the stored and invalidated keys match.
 * RedisService is retained only for the feature-flag pub/sub publish call.
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly cache: RedisCacheService,
    private readonly redis: RedisService,
  ) {}

  async invalidateProvider(providerId: string): Promise<void> {
    // S7: pass keys WITHOUT 'rg:cache:' prefix — RedisCacheService adds it
    await this.cache.del(`provider:${providerId}`);
    await this.cache.delByPattern(`provider:${providerId}:*`);
    await this.cache.delByPattern(`search:*`);
  }

  async invalidateServiceCatalog(religionId?: string): Promise<void> {
    if (religionId) {
      await this.cache.del(`catalog:${religionId}`);
    } else {
      await this.cache.delByPattern(`catalog:*`);
    }
  }

  async invalidatePricingRules(): Promise<void> {
    await this.cache.delByPattern(`pricing:*`);
  }

  async invalidateSearchResults(): Promise<void> {
    await this.cache.delByPattern(`search:*`);
  }

  async invalidateUserPreferences(userId: string): Promise<void> {
    await this.cache.del(`user:prefs:${userId}`);
  }

  async invalidateFeatureFlag(flag: string): Promise<void> {
    // Feature flag cache is in-process (FeatureFlagsService) — signal all pods
    // via RedisService pub/sub so each pod clears its L1 cache.
    // Note: RedisService has keyPrefix 'rg:' — channel names are NOT
    // affected by keyPrefix in ioredis publish(), so this is correct.
    await this.redis.publish('rg:ff:invalidate', flag);
  }
}
