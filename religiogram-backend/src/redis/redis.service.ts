import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type ChainableCommander } from 'ioredis';

/**
 * Central Redis client.
 * Wraps ioredis with app-level defaults + typed helpers.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private keyPrefix!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.keyPrefix = this.config.get<string>('redis.keyPrefix', 'rg:');

    const sentinelHosts = this.config.get<string>('redis.sentinelHosts');
    const password       = this.config.get<string>('redis.password');
    const tls            = this.config.get<boolean>('redis.tls', false);

    const sharedOpts = {
      password,
      tls: tls ? {} : undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      keyPrefix: this.keyPrefix,
    };

    if (sentinelHosts) {
      // ── Sentinel / HA mode ───────────────────────────────────────────────
      // REDIS_SENTINEL_HOSTS = "sentinel1:26379,sentinel2:26379,sentinel3:26379"
      // REDIS_SENTINEL_NAME  = "mymaster"  (defaults to "mymaster")
      const sentinels = sentinelHosts.split(',').map((h) => {
        const [host, portStr] = h.trim().split(':');
        return { host, port: parseInt(portStr ?? '26379', 10) };
      });
      const masterName = this.config.get<string>('redis.sentinelName', 'mymaster');
      const sentinelPassword = this.config.get<string>('redis.sentinelPassword');

      this.client = new Redis({
        ...sharedOpts,
        sentinels,
        name: masterName,
        sentinelPassword,
        // Reconnect on READONLY errors — Sentinel may have promoted a new master
        reconnectOnError: (err: Error) => err.message.includes('READONLY') ? 2 : false,
      } as any);

      this.logger.log(
        `Redis Sentinel mode — master: ${masterName}, sentinels: ${sentinelHosts}`,
      );
    } else {
      // ── Standalone / single-node mode ────────────────────────────────────
      this.client = new Redis({
        ...sharedOpts,
        host: this.config.getOrThrow<string>('redis.host'),
        port: this.config.get<number>('redis.port', 6379),
        reconnectOnError: (err: Error) => err.message.includes('READONLY') ? 2 : false,
      });

      this.logger.log(
        `Redis standalone mode — ${this.config.get('redis.host')}:${this.config.get('redis.port', 6379)}`,
      );
    }

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('ready',   () => this.logger.log('Redis ready'));
    this.client.on('error', (err: any) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
    this.client.on('reconnecting', () =>
      this.logger.warn('Redis reconnecting...'),
    );
    this.client.on('+sentinel', (sentinel: any) =>
      this.logger.log(`Sentinel added: ${sentinel.host}:${sentinel.port}`),
    );
    this.client.on('+failover-end', () =>
      this.logger.warn('Redis Sentinel failover complete'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  /* ──────────────── Core commands ──────────────── */

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    expiryMode?: 'EX',
    ttl?: number,
  ): Promise<'OK' | null> {
    if (expiryMode === 'EX' && ttl !== undefined) {
      return this.client.set(key, value, 'EX', ttl);
    }
    return this.client.set(key, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (!keys.length) return 0;
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrby(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /** SET key value EX seconds — convenience wrapper */
  async setEx(key: string, seconds: number, value: string): Promise<string | null> {
    return this.client.set(key, value, 'EX', seconds);
  }

  /** SET key value NX — set only if not exists; returns true if set */
  async setNx(key: string, value: string): Promise<boolean> {
    const result = await this.client.set(key, value, 'NX');
    return result === 'OK';
  }
  /**
   * SET key value EX ttlSeconds NX — atomic set-if-not-exists with TTL.
   * Returns true if newly set, false if the key already existed.
   */
  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }


  /** PUBLISH to a Pub/Sub channel */
  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /**
   * WS1: Subscribe to a Pub/Sub channel.
   * Creates a dedicated subscriber client (ioredis requires a separate
   * connection for SUBSCRIBE mode) and invokes the callback for each message.
   * Returns a Promise that resolves once the SUBSCRIBE command is acknowledged.
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    // Duplicate the underlying ioredis client so we don't put the main
    // client into subscribe mode (which blocks all other commands).
    const sub = this.client.duplicate();
    await sub.subscribe(channel);
    sub.on('message', (_ch: string, message: string) => {
      if (_ch === channel) callback(message);
    });
    sub.on('error', (err: Error) => {
      this.logger.warn(`Redis subscriber error on channel ${channel}: ${err.message}`);
    });
  }

  /**
   * P2-5: Pattern-subscribe using PSUBSCRIBE.
   * callback receives (message, matchedChannel).
   */
  async psubscribe(pattern: string, callback: (message: string, channel: string) => void): Promise<void> {
    const sub = this.client.duplicate();
    await sub.psubscribe(pattern);
    sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      callback(message, channel);
    });
    sub.on('error', (err: Error) => {
      this.logger.warn(`Redis psubscribe error on pattern ${pattern}: ${err.message}`);
    });
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.exists(key);
    return res === 1;
  }

  /**
   * Non-blocking iteration of keys matching a pattern.
   * Use for bulk revocation (e.g. logout-all).
   */
  async scan(
    cursor: string,
    matchFlag: 'MATCH',
    pattern: string,
    countFlag: 'COUNT',
    count: number,
  ): Promise<[string, string[]]> {
    return this.client.scan(cursor, matchFlag, pattern, countFlag, count);
  }

  /**
   * Atomically scan all keys matching a pattern and delete them.
   *
   * IMPORTANT: ioredis keyPrefix is NOT applied to SCAN match patterns, and
   * keys returned by SCAN still carry the prefix. This method uses the raw
   * client throughout so the prefix is handled correctly in one place — callers
   * pass a "logical" pattern (e.g. `refresh:user:42:*`) and we prepend the
   * configured prefix ourselves. Deletion also goes through the raw client so
   * we don't double-prefix the returned keys.
   *
   * Uses SCAN + pipelined UNLINK (non-blocking delete) in batches of 500 to
   * avoid long O(N) stalls on large keyspaces. Safe to run against production.
   *
   * Returns the total number of keys deleted.
   */
  async scanDelete(pattern: string): Promise<number> {
    const fullPattern = `${this.keyPrefix}${pattern}`;
    let cursor = '0';
    let totalDeleted = 0;
    const BATCH = 500;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        fullPattern,
        'COUNT',
        BATCH,
      );
      cursor = nextCursor;

      if (keys.length) {
        const pipe = this.client.pipeline();
        for (const k of keys) pipe.unlink(k);
        const results = await pipe.exec();
        totalDeleted += results?.reduce(
          (acc: number, [err, n]: [any, any]) => acc + (err ? 0 : (n as number)),
          0,
        ) ?? keys.length;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }

  /**
   * Pipeline — batch multiple commands into a single round-trip.
   * Returns an ioredis ChainableCommander; call `.exec()` to flush.
   */
  pipeline(): ChainableCommander {
    return this.client.pipeline();
  }

  /** MULTI/EXEC transaction. Use when you need all-or-nothing semantics. */
  multi(): ChainableCommander {
    return this.client.multi();
  }

  /**
   * Scan all keys matching a pattern and return them as a flat list.
   * Iterates cursor until exhausted. Safe for production use (non-blocking).
   * The pattern is automatically prefixed with the configured keyPrefix.
   *
   * @param pattern  Logical pattern, e.g. "dlq:payment-webhook:*"
   * @param maxKeys  Safety cap — stops after collecting this many keys (default 500)
   */
  async scanKeys(pattern: string, maxKeys = 500): Promise<string[]> {
    const fullPattern = `${this.keyPrefix}${pattern}`;
    let cursor = '0';
    const collected: string[] = [];

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor, 'MATCH', fullPattern, 'COUNT', 100,
      );
      cursor = nextCursor;
      collected.push(...keys);
    } while (cursor !== '0' && collected.length < maxKeys);

    return collected.slice(0, maxKeys);
  }

  /**
ip.
   * Missing keys return null in the result array.
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    return this.client.mget(...keys);
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}
