import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AlertsService } from '../alerts/alerts.service';

/* eslint-disable @typescript-eslint/no-var-requires */
let GrowthBook: any;
let setPolyfills: any;
try {
  const gb = require('@growthbook/growthbook');
  GrowthBook  = gb.GrowthBook;
  setPolyfills = gb.setPolyfills;
} catch {
  // GrowthBook not installed — fall through to Redis / env tiers.
}
/* eslint-enable @typescript-eslint/no-var-requires */

export type FeatureFlagKey =
  | 'ENABLE_CHAT'
  | 'ENABLE_BOOKING'
  | 'ENABLE_CONSULTATION'
  | 'ENABLE_DONATIONS'
  | 'ENABLE_WALLET_TOPUP'
  // When true, createPost defers fan-out to a BullMQ job for authors with
  // > FEED_ASYNC_FANOUT_THRESHOLD accepted friendships (default: 500).
  // This prevents the fan-out from blocking the HTTP response for viral/celebrity users.
  | 'ENABLE_ASYNC_FANOUT';

/**
 * Three-tier feature flags (highest priority first):
 *
 *   Tier 1 — GrowthBook OSS:
 *     GrowthBook SDK polled every 60 s from `GROWTHBOOK_API_HOST` + `GROWTHBOOK_CLIENT_KEY`.
 *     If the feature key is defined in GrowthBook, its value wins.
 *     Falls through to Tier 2 when:
 *       • SDK is not installed (`@growthbook/growthbook` not in node_modules)
 *       • `GROWTHBOOK_CLIENT_KEY` env var is absent
 *       • Feature key is not defined in the GrowthBook payload
 *
 *   Tier 2 — Redis live toggle (key `rg:ff:<FLAG>`):
 *     Admin can flip a flag in real time without a deploy.
 *     5-second in-memory cache reduces Redis round-trips.
 *     Falls through to Tier 3 when Redis key is absent or Redis is down.
 *
 *   Tier 3 — env var fallback (`FF_<FLAG>` via configuration.ts):
 *     Static fallback baked into the deployment config.
 *     Parsed as 'true' | 'false'. Anything else → false (fail-closed).
 *
 * Why three tiers?
 *   GrowthBook gives us percentage rollouts, A/B tests, and a UI without
 *   LaunchDarkly costs. Redis gives ops a quick kill-switch. Env is the
 *   last line of defence so the service starts cleanly even with no network.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cacheTtlMs = 5_000;
  private readonly cache = new Map<string, { value: boolean; expiresAt: number }>();

  /** GrowthBook SDK instance — null if package absent or not configured. */
  private gb: any | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly alerts: AlertsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initGrowthBook();
    // Pre-warm the in-memory cache so the first request is not cold.
    await Promise.all(
      (
        [
          'ENABLE_CHAT',
          'ENABLE_BOOKING',
          'ENABLE_CONSULTATION',
          'ENABLE_DONATIONS',
          'ENABLE_WALLET_TOPUP',
          'ENABLE_ASYNC_FANOUT',
        ] as FeatureFlagKey[]
      ).map((f) => this.isEnabled(f)),
    );
    this.logger.log(
      `Feature flags pre-warmed: ${Array.from(this.cache.keys()).join(', ')}` +
      (this.gb ? ' [GrowthBook active]' : ' [GrowthBook inactive]'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.gb) {
      try {
        await this.gb.destroy();
      } catch {
        // ignore
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async isEnabled(flag: FeatureFlagKey): Promise<boolean> {
    const cached = this.cache.get(flag);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.resolveFlag(flag);
    this.cache.set(flag, { value, expiresAt: Date.now() + this.cacheTtlMs });
    return value;
  }

  /**
   * Admin mutation — sets the Redis kill-switch key.
   * The change propagates to all pods within 5 s (cache TTL).
   * GrowthBook values are not affected by this; to override GrowthBook you
   * must set the flag in GrowthBook's own UI or use a forced variation.
   */
  async setFlag(flag: FeatureFlagKey, enabled: boolean): Promise<void> {
    const redisKey = `rg:ff:${flag}`;
    await this.redis.set(redisKey, enabled ? '1' : '0');
    this.cache.delete(flag);
  }

  /**
   * Throwing variant — use as the first line of a controller method to
   * short-circuit when the feature is disabled.
   */
  async assertEnabled(flag: FeatureFlagKey): Promise<void> {
    const enabled = await this.isEnabled(flag);
    if (!enabled) {
      const err: Error & { status?: number } = new Error(
        `Feature ${flag} is currently disabled`,
      );
      err.name  = 'FeatureDisabledError';
      err.status = 503;
      throw err;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async initGrowthBook(): Promise<void> {
    if (!GrowthBook) return; // package not installed

    const clientKey = this.config.get<string>('featureFlags.growthbookClientKey');
    if (!clientKey) {
      this.logger.warn('GROWTHBOOK_CLIENT_KEY not set — GrowthBook tier disabled');
      return;
    }

    const apiHost =
      this.config.get<string>('featureFlags.growthbookApiHost') ??
      'https://cdn.growthbook.io';

    // In Node.js we need to polyfill fetch if running on Node < 18.
    if (typeof globalThis.fetch === 'undefined' && setPolyfills) {
      try {
        const nodeFetch = require('node-fetch');
        setPolyfills({ fetch: nodeFetch });
      } catch {
        // node-fetch not available — GrowthBook will fall back to XHR or fail silently.
      }
    }

    this.gb = new GrowthBook({
      apiHost,
      clientKey,
      // Refresh features from CDN every 60 seconds.
      backgroundSync: true,
      subscribeToChanges: false,
    });

    try {
      await this.gb.loadFeatures({ autoRefresh: true, timeout: 5_000 });
      this.logger.log(`GrowthBook features loaded from ${apiHost}`);
    } catch (err) {
      this.logger.warn(`GrowthBook feature load failed (falling back to Redis/env): ${(err as Error).message}`);
      this.gb = null; // treat as unavailable so tiers 2/3 take over
    }
  }

  private async resolveFlag(flag: FeatureFlagKey): Promise<boolean> {
    // ── Tier 1: GrowthBook ──
    if (this.gb) {
      try {
        // GrowthBook key convention: lower-kebab-case of the flag name.
        const gbKey = flag.toLowerCase().replace(/_/g, '-'); // e.g. enable-chat
        const feature = this.gb.getFeature(gbKey);
        if (feature && feature.source !== 'unknownFeature') {
          return !!this.gb.isOn(gbKey);
        }
        // Feature not defined in GrowthBook → fall through.
      } catch (err) {
        this.logger.warn(`GrowthBook evaluation error for ${flag}: ${(err as Error).message}`);
      }
    }

    // ── Tier 2: Redis live toggle ──
    try {
      const raw = await this.redis.get(`rg:ff:${flag}`);
      if (raw === '1' || raw === 'true')  return true;
      if (raw === '0' || raw === 'false') return false;
      // Key absent → fall through to env.
    } catch (err) {
      void this.alerts.fire({
        channel: 'feature_flag_read_error',
        severity: 'warn',
        message: `Feature flag Redis read failed for ${flag}; using env fallback`,
        context: { flag },
        error: err as Error,
      });
    }

    // ── Tier 3: env var fallback ──
    const envVal = this.config.get<string>(`featureFlags.${flag}`);
    return envVal === 'true';
  }
}
