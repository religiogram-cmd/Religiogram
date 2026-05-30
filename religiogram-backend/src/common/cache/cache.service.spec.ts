import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { RedisCacheService } from '../../redis/redis-cache.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRedisCache = {
  get:          jest.fn().mockResolvedValue(null),
  set:          jest.fn().mockResolvedValue('OK'),
  del:          jest.fn().mockResolvedValue(1),
  delByPattern: jest.fn().mockResolvedValue(0),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CacheService', () => {
  let svc: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisCache.get.mockResolvedValue(null);
    mockRedisCache.set.mockResolvedValue('OK');
    mockRedisCache.del.mockResolvedValue(1);
    mockRedisCache.delByPattern.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: RedisCacheService, useValue: mockRedisCache },
      ],
    }).compile();

    svc = module.get<CacheService>(CacheService);
  });

  // ── getOrSet ───────────────────────────────────────────────────────────────

  describe('getOrSet()', () => {
    it('returns parsed cached value without calling fetcher on cache hit', async () => {
      const payload = [{ id: 1, name: 'temple' }];
      mockRedisCache.get.mockResolvedValueOnce(JSON.stringify(payload));

      const fetcher = jest.fn();
      const result = await svc.getOrSet('temples:list:delhi', fetcher, { ttl: 300 });

      expect(result).toEqual(payload);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('calls fetcher and returns its value on cache miss', async () => {
      mockRedisCache.get.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockResolvedValue([{ id: 2 }]);

      const result = await svc.getOrSet('temples:list:mumbai', fetcher, { ttl: 60 });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 2 }]);
    });

    it('writes fetched value to Redis after a cache miss (fire-and-forget)', async () => {
      mockRedisCache.get.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockResolvedValue({ count: 42 });

      await svc.getOrSet('some:key', fetcher, { ttl: 120 });

      // Allow microtasks to flush (fire-and-forget write)
      await Promise.resolve();

      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'some:key',
        JSON.stringify({ count: 42 }),
        120,
      );
    });

    it('falls through to fetcher when Redis.get throws', async () => {
      mockRedisCache.get.mockRejectedValueOnce(new Error('Connection refused'));
      const fetcher = jest.fn().mockResolvedValue('fallback-value');

      const result = await svc.getOrSet('key:fallback', fetcher, { ttl: 30 });

      expect(result).toBe('fallback-value');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('does NOT write to Redis when falling through on Redis error', async () => {
      mockRedisCache.get.mockRejectedValueOnce(new Error('Timeout'));
      const fetcher = jest.fn().mockResolvedValue('data');

      await svc.getOrSet('key:err', fetcher, { ttl: 30 });

      // set should not be called on the error bypass path
      expect(mockRedisCache.set).not.toHaveBeenCalled();
    });

    it('treats corrupt (non-JSON) cached value as a miss and calls fetcher', async () => {
      mockRedisCache.get.mockResolvedValueOnce('not-valid-json{{{');
      const fetcher = jest.fn().mockResolvedValue(['fresh']);

      const result = await svc.getOrSet('key:corrupt', fetcher, { ttl: 60 });

      expect(result).toEqual(['fresh']);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('passes correct TTL to Redis.set after miss', async () => {
      mockRedisCache.get.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockResolvedValue([]);

      await svc.getOrSet('key:ttl', fetcher, { ttl: 999 });
      await Promise.resolve(); // flush fire-and-forget

      expect(mockRedisCache.set).toHaveBeenCalledWith('key:ttl', '[]', 999);
    });

    it('does not throw when the fire-and-forget cache write fails', async () => {
      mockRedisCache.get.mockResolvedValueOnce(null);
      mockRedisCache.set.mockRejectedValueOnce(new Error('OOM'));
      const fetcher = jest.fn().mockResolvedValue('data');

      await expect(svc.getOrSet('key:write-fail', fetcher, { ttl: 60 })).resolves.toBe('data');
    });
  });

  // ── set ────────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('serializes value to JSON before writing', async () => {
      await svc.set('config:foo', { enabled: true }, 600);
      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'config:foo',
        JSON.stringify({ enabled: true }),
        600,
      );
    });

    it('serializes arrays correctly', async () => {
      await svc.set('list:key', [1, 2, 3], 60);
      expect(mockRedisCache.set).toHaveBeenCalledWith('list:key', '[1,2,3]', 60);
    });
  });

  // ── del ────────────────────────────────────────────────────────────────────

  describe('del()', () => {
    it('calls redis.del with the given key', async () => {
      await svc.del('session:abc');
      expect(mockRedisCache.del).toHaveBeenCalledWith('session:abc');
    });

    it('passes multiple keys to redis.del in a single call', async () => {
      await svc.del('key:1', 'key:2', 'key:3');
      expect(mockRedisCache.del).toHaveBeenCalledWith('key:1', 'key:2', 'key:3');
    });

    it('skips redis.del when called with no keys', async () => {
      await svc.del();
      expect(mockRedisCache.del).not.toHaveBeenCalled();
    });
  });

  // ── invalidatePattern ──────────────────────────────────────────────────────

  describe('invalidatePattern()', () => {
    it('returns the count of deleted keys from delByPattern', async () => {
      mockRedisCache.delByPattern.mockResolvedValueOnce(7);
      const count = await svc.invalidatePattern('temples:*');
      expect(count).toBe(7);
    });

    it('calls delByPattern with the correct pattern', async () => {
      await svc.invalidatePattern('priests:city:varanasi:*');
      expect(mockRedisCache.delByPattern).toHaveBeenCalledWith('priests:city:varanasi:*');
    });

    it('returns 0 when no keys matched', async () => {
      mockRedisCache.delByPattern.mockResolvedValueOnce(0);
      const count = await svc.invalidatePattern('nonexistent:*');
      expect(count).toBe(0);
    });
  });
});
