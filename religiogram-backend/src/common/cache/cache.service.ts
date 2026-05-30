import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../redis/redis-cache.service';

/**
 * Application-level cache service backed by the dedicated cache Redis.
 *
 * Uses RedisCacheService (not the main RedisService) which connects to
 * the redis-cache container configured with:
 *   maxmemory 256mb
 *   maxmemory-policy allkeys-lru
 *
 * This isolates HTTP cache memory pressure from BullMQ / throttle data
 * on the main Redis (which uses noeviction).
 *
 * Usage:
 *   const temples = await this.cache.getOrSet(
 *     `temples:list:${cityId}`,
 *     () => this.db.findTemples(cityId),
 *     { ttl: 300 },        // 5 min
 *   );
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisCacheService) {}

  /**
   * Cache-aside read.
   * Returns the cached value if present; otherwise calls `fetcher`,
   * stores the result, and returns it.
   * On any Redis error, falls through to the fetcher — cache failures
   * must never take down the API.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    opts: { ttl: number /* seconds */ },
  ): Promise<T> {
    try {
      const raw = await this.redis.get(key);
      if (raw !== null) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          this.logger.warn(`Cache parse error for key "${key}" -- treating as miss`);
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Cache read error for "${key}": ${(err as Error).message} -- bypassing cache`);
      return fetcher();
    }

    const value = await fetcher();
    // Fire-and-forget the write -- caller already has the value
    this.redis
      .set(key, JSON.stringify(value), opts.ttl)
      .catch((err: Error) =>
        this.logger.warn(`Cache write failed for "${key}": ${err.message}`),
      );
    return value;
  }

  /** Unconditional cache write. */
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttl);
  }

  /** Delete one or more exact keys. */
  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  /**
   * Delete all keys matching a glob pattern (tag-based cache bust).
   * Uses SCAN under the hood — safe on large keyspaces.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const deleted = await this.redis.delByPattern(pattern);
    if (deleted) {
      this.logger.debug(`Invalidated ${deleted} cache keys matching "${pattern}"`);
    }
    return deleted;
  }
}
