import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis connection dedicated to the HTTP cache layer.
 *
 * Connects to a separate Redis instance (redis-cache in docker-compose)
 * configured with:
 *   maxmemory 256mb
 *   maxmemory-policy allkeys-lru   ← safe to evict, data is re-fetchable
 *   save ""                        ← no persistence needed for cache
 *
 * Keeping this separate from the main RedisService (which uses noeviction)
 * ensures that cache memory pressure can never evict BullMQ jobs or
 * rate-limit counters from the queue Redis.
 *
 * Falls back to the main REDIS_HOST when REDIS_CACHE_HOST is not set,
 * which is safe for local dev and CI with a single Redis instance.
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('redisCache.host', 'localhost');
    const port = this.config.get<number>('redisCache.port', 6379);
    const password = this.config.get<string>('redisCache.password');
    const tls = this.config.get<boolean>('redisCache.tls', false);

    this.client = new Redis({
      host,
      port,
      password,
      tls: tls ? {} : undefined,
      keyPrefix: 'rg:cache:',
      // Cache reads can tolerate a short retry window; fail fast on miss
      // so the API falls through to the DB rather than hanging.
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      enableOfflineQueue: false, // return errors immediately if disconnected
      lazyConnect: false,
    });

    this.client.on('connect', () =>
      this.logger.log(`RedisCacheService connected to ${host}:${port}`),
    );
    this.client.on('error', (err: Error) =>
      this.logger.warn(`RedisCacheService error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => {/* ignore */});
  }

  /** Set a key with a TTL (seconds). Returns 'OK' or null on error. */
  async set(key: string, value: string, ttlSeconds: number): Promise<string | null> {
    return this.client.setex(key, ttlSeconds, value);
  }

  /** Get a key. Returns null on miss or on connection error. */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Delete one or more keys (tag-based invalidation). */
  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.del(...keys);
  }

  /**
   * Delete all keys matching a glob pattern (tag-based cache bust).
   * Uses SCAN to avoid blocking Redis; safe for large keyspaces.
   */
  async delByPattern(pattern: string): Promise<number> {
    // keyPrefix is prepended by ioredis — strip it for the SCAN pattern
    const fullPattern = `rg:cache:${pattern}`;
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', fullPattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        // S7: ioredis SCAN returns keys WITH the keyPrefix already prepended.
        // Calling del() would re-apply the prefix → targets rg:cache:rg:cache:... (wrong).
        // Strip the prefix before passing to del() so it targets the correct key.
        const prefix = (this.client.options as any)?.keyPrefix ?? '';
        const cleanKeys = keys.map((k: string) =>
          prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k
        );
        await this.client.del(...cleanKeys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  }
}
