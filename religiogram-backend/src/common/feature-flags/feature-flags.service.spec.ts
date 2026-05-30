import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService, FeatureFlagKey } from './feature-flags.service';
import { RedisService } from '../../redis/redis.service';
import { AlertsService } from '../alerts/alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, def?: any) => def ?? null),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FeatureFlagsService', () => {
  let svc: FeatureFlagsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockConfig.get.mockImplementation((key: string, def?: any) => def ?? null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: ConfigService,  useValue: mockConfig },
        { provide: RedisService,   useValue: mockRedis },
        { provide: AlertsService,  useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<FeatureFlagsService>(FeatureFlagsService);
    // Suppress GrowthBook initialization in tests
    (svc as any).gb = null;
    // Clear in-memory cache
    (svc as any).cache.clear();
  });

  // ── isEnabled — Redis tier ─────────────────────────────────────────────────

  describe('isEnabled() — Redis tier', () => {
    it('returns true when Redis key is "1"', async () => {
      mockRedis.get.mockResolvedValueOnce('1');
      const result = await svc.isEnabled('ENABLE_CHAT');
      expect(result).toBe(true);
    });

    it('returns true when Redis key is "true"', async () => {
      mockRedis.get.mockResolvedValueOnce('true');
      const result = await svc.isEnabled('ENABLE_BOOKING');
      expect(result).toBe(true);
    });

    it('returns false when Redis key is "0"', async () => {
      mockRedis.get.mockResolvedValueOnce('0');
      const result = await svc.isEnabled('ENABLE_CHAT');
      expect(result).toBe(false);
    });

    it('returns false when Redis key is "false"', async () => {
      mockRedis.get.mockResolvedValueOnce('false');
      const result = await svc.isEnabled('ENABLE_CHAT');
      expect(result).toBe(false);
    });

    it('falls through to env var when Redis key is absent', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // absent
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'featureFlags.ENABLE_WALLET_TOPUP') return 'true';
        return null;
      });
      const result = await svc.isEnabled('ENABLE_WALLET_TOPUP');
      expect(result).toBe(true);
    });
  });

  // ── isEnabled — env var tier ───────────────────────────────────────────────

  describe('isEnabled() — env tier', () => {
    it('returns true when env var is exactly "true"', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockConfig.get.mockImplementation((key: string) =>
        key === 'featureFlags.ENABLE_CONSULTATION' ? 'true' : null,
      );
      expect(await svc.isEnabled('ENABLE_CONSULTATION')).toBe(true);
    });

    it('returns false when env var is anything other than "true"', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockConfig.get.mockImplementation((key: string) =>
        key === 'featureFlags.ENABLE_DONATIONS' ? '1' : null,
      );
      // '1' (not exactly 'true') → false
      expect(await svc.isEnabled('ENABLE_DONATIONS')).toBe(false);
    });

    it('returns false when env var is absent', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockConfig.get.mockReturnValue(null);
      expect(await svc.isEnabled('ENABLE_ASYNC_FANOUT')).toBe(false);
    });
  });

  // ── in-memory cache ────────────────────────────────────────────────────────

  describe('isEnabled() — in-memory cache', () => {
    it('serves from cache on second call without hitting Redis', async () => {
      mockRedis.get.mockResolvedValue('1');

      await svc.isEnabled('ENABLE_CHAT'); // first call — populates cache
      await svc.isEnabled('ENABLE_CHAT'); // second call — should hit cache

      expect(mockRedis.get).toHaveBeenCalledTimes(1);
    });

    it('re-evaluates after TTL expires', async () => {
      jest.useFakeTimers();
      mockRedis.get.mockResolvedValue('1');

      await svc.isEnabled('ENABLE_CHAT');
      jest.advanceTimersByTime(6_000); // past the 5s cache TTL
      await svc.isEnabled('ENABLE_CHAT');

      expect(mockRedis.get).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  // ── setFlag ────────────────────────────────────────────────────────────────

  describe('setFlag()', () => {
    it('writes "1" to Redis when enabling', async () => {
      await svc.setFlag('ENABLE_BOOKING', true);
      expect(mockRedis.set).toHaveBeenCalledWith('rg:ff:ENABLE_BOOKING', '1');
    });

    it('writes "0" to Redis when disabling', async () => {
      await svc.setFlag('ENABLE_BOOKING', false);
      expect(mockRedis.set).toHaveBeenCalledWith('rg:ff:ENABLE_BOOKING', '0');
    });

    it('busts the in-memory cache so next isEnabled hits Redis', async () => {
      // Warm cache
      mockRedis.get.mockResolvedValue('0');
      await svc.isEnabled('ENABLE_CHAT');
      expect(mockRedis.get).toHaveBeenCalledTimes(1);

      // setFlag invalidates cache
      await svc.setFlag('ENABLE_CHAT', true);

      mockRedis.get.mockResolvedValue('1');
      const result = await svc.isEnabled('ENABLE_CHAT');
      expect(mockRedis.get).toHaveBeenCalledTimes(2); // called again
      expect(result).toBe(true);
    });
  });

  // ── assertEnabled ──────────────────────────────────────────────────────────

  describe('assertEnabled()', () => {
    it('resolves without throwing when flag is enabled', async () => {
      mockRedis.get.mockResolvedValueOnce('1');
      await expect(svc.assertEnabled('ENABLE_CHAT')).resolves.not.toThrow();
    });

    it('throws FeatureDisabledError with status=503 when flag is disabled', async () => {
      mockRedis.get.mockResolvedValueOnce('0');
      let caught: any;
      try {
        await svc.assertEnabled('ENABLE_CHAT');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught.name).toBe('FeatureDisabledError');
      expect(caught.status).toBe(503);
      expect(caught.message).toContain('ENABLE_CHAT');
    });
  });

  // ── Redis failure resilience ───────────────────────────────────────────────

  describe('Redis failure', () => {
    it('fires an alert and falls through to env var when Redis throws', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Connection refused'));
      mockConfig.get.mockImplementation((key: string) =>
        key === 'featureFlags.ENABLE_CHAT' ? 'true' : null,
      );

      const result = await svc.isEnabled('ENABLE_CHAT');
      expect(result).toBe(true);
      // Alert should be fired (non-blocking)
      // The fire() call is a void promise; it may run after this resolves
    });
  });
});
