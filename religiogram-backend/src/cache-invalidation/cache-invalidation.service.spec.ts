import { Test, TestingModule } from '@nestjs/testing';
import { CacheInvalidationService } from './cache-invalidation.service';
import { RedisService } from '../redis/redis.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRedis = {
  del:     jest.fn().mockResolvedValue(1),
  scan:    jest.fn().mockResolvedValue(['0', []]),
  publish: jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CacheInvalidationService', () => {
  let svc: CacheInvalidationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    mockRedis.scan.mockResolvedValue(['0', []]); // empty SCAN result (no keys)
    mockRedis.publish.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInvalidationService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<CacheInvalidationService>(CacheInvalidationService);
  });

  // ── invalidateProvider ─────────────────────────────────────────────────────

  describe('invalidateProvider()', () => {
    it('deletes the exact provider key directly', async () => {
      await svc.invalidateProvider('prov-1');
      // rg:cache:provider:prov-1 has no wildcard — del directly
      expect(mockRedis.del).toHaveBeenCalledWith('rg:cache:provider:prov-1');
    });

    it('scans for wildcard keys (provider:id:* and search:*)', async () => {
      await svc.invalidateProvider('prov-1');
      const scanPatterns = mockRedis.scan.mock.calls.map(([, , p]) => p);
      expect(scanPatterns).toContain('rg:cache:provider:prov-1:*');
      expect(scanPatterns).toContain('rg:cache:search:*');
    });

    it('resolves without throwing when Redis returns no matching keys', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);
      await expect(svc.invalidateProvider('prov-1')).resolves.not.toThrow();
    });

    it('deletes matching scan keys individually', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', ['rg:cache:provider:prov-1:profile', 'rg:cache:provider:prov-1:services']])
        .mockResolvedValue(['0', []]);

      await svc.invalidateProvider('prov-1');
      expect(mockRedis.del).toHaveBeenCalledWith('rg:cache:provider:prov-1:profile');
      expect(mockRedis.del).toHaveBeenCalledWith('rg:cache:provider:prov-1:services');
    });
  });

  // ── invalidateServiceCatalog ───────────────────────────────────────────────

  describe('invalidateServiceCatalog()', () => {
    it('deletes exact key when religionId is provided', async () => {
      await svc.invalidateServiceCatalog('hinduism');
      expect(mockRedis.del).toHaveBeenCalledWith('rg:cache:catalog:hinduism');
      expect(mockRedis.scan).not.toHaveBeenCalled();
    });

    it('scans for wildcard pattern when no religionId provided', async () => {
      await svc.invalidateServiceCatalog();
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0', 'MATCH', 'rg:cache:catalog:*', 'COUNT', 100,
      );
    });
  });

  // ── invalidatePricingRules ─────────────────────────────────────────────────

  describe('invalidatePricingRules()', () => {
    it('scans pricing:* pattern', async () => {
      await svc.invalidatePricingRules();
      const patterns = mockRedis.scan.mock.calls.map(([, , p]) => p);
      expect(patterns).toContain('rg:cache:pricing:*');
    });
  });

  // ── invalidateSearchResults ────────────────────────────────────────────────

  describe('invalidateSearchResults()', () => {
    it('scans search:* pattern', async () => {
      await svc.invalidateSearchResults();
      const patterns = mockRedis.scan.mock.calls.map(([, , p]) => p);
      expect(patterns).toContain('rg:cache:search:*');
    });
  });

  // ── invalidateUserPreferences ──────────────────────────────────────────────

  describe('invalidateUserPreferences()', () => {
    it('deletes exact user prefs key', async () => {
      await svc.invalidateUserPreferences('user-1');
      expect(mockRedis.del).toHaveBeenCalledWith('rg:cache:user:prefs:user-1');
    });
  });

  // ── invalidateFeatureFlag ──────────────────────────────────────────────────

  describe('invalidateFeatureFlag()', () => {
    it('publishes to rg:ff:invalidate channel with the flag name', async () => {
      await svc.invalidateFeatureFlag('ENABLE_CHAT');
      expect(mockRedis.publish).toHaveBeenCalledWith('rg:ff:invalidate', 'ENABLE_CHAT');
    });
  });

  // ── SCAN cursor pagination ─────────────────────────────────────────────────

  describe('SCAN cursor pagination', () => {
    it('continues scanning until cursor returns "0"', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['42',  ['key:1']])
        .mockResolvedValueOnce(['99',  ['key:2']])
        .mockResolvedValueOnce(['0',   ['key:3']]);

      await svc.invalidateSearchResults();

      expect(mockRedis.scan).toHaveBeenCalledTimes(3);
      expect(mockRedis.del).toHaveBeenCalledWith('key:1');
      expect(mockRedis.del).toHaveBeenCalledWith('key:2');
      expect(mockRedis.del).toHaveBeenCalledWith('key:3');
    });
  });
});
