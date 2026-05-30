import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * Global Redis module.
 *
 * Exports two services:
 *   RedisService      — queue Redis (noeviction); used by BullMQ, throttle,
 *                       sessions, DLQ, feature flags.
 *   RedisCacheService — cache Redis (allkeys-lru); used by CacheService for
 *                       HTTP response caching. Separate instance so cache
 *                       memory pressure cannot evict job data.
 */
@Global()
@Module({
  providers: [RedisService, RedisCacheService],
  exports: [RedisService, RedisCacheService],
})
export class RedisModule {}
