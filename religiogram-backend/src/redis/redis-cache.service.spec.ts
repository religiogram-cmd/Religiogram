import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// ── Mock ioredis ───────────────────────────────────────────────────────────────

const mockCacheClient = {
  setex: jest.fn().mockResolvedValue('OK'),
  get:   jest.fn().mockResolvedValue(null),
  del:   jest.fn().mockResolvedValue(1),
  scan:  jest.fn().mockResolvedValue(['0', []]),
  quit:  jest.fn().mockResolvedValue('OK'),
  on:    jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockCacheClient);
});

import { RedisCacheService } from './redis-cache.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'redisCache.host':     'localhost',
      'redisCache.port':     6380,
      'redisCache.tls':      false,
    };
    return map[key] ?? def;
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RedisCacheService', () => {
  let svc: RedisCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheClient.get.mockResolvedValue(null);
    mockCacheClient.setex.mockResolvedValue('OK');
    mockCacheClient.del.mockResolvedValue(1);
    mockCacheClient.scan.mockResolvedValue(['0', []]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<RedisCacheService>(RedisCacheService);
    svc.onModuleInit();
  });

  afterEach(async () => {
    await svc.onModuleDestroy();
  });

  // ── set ────────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('calls setex with key, ttl, and value', async () => {
      await svc.set('some:key', 'value-json', 300);
      expect(mockCacheClient.setex).toHaveBeenCalledWith('some:key', 300, 'value-json');
    });

    it('returns the result from setex', async () => {
      mockCacheClient.setex.mockResolvedValueOnce('OK');
      const result = await svc.set('k', 'v', 60);
      expect(result).toBe('OK');
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns null on miss', async () => {
      mockCacheClient.get.mockResolvedValueOnce(null);
      expect(await svc.get('missing:key')).toBeNull();
    });

    it('returns cached string value on hit', async () => {
      mockCacheClient.get.mockResolvedValueOnce('{"id":1}');
      expect(await svc.get('hit:key')).toBe('{"id":1}');
    });
  });

  // ── del ────────────────────────────────────────────────────────────────────

  describe('del()', () => {
    it('skips client.del when called with no keys', async () => {
      await svc.del();
      expect(mockCacheClient.del).not.toHaveBeenCalled();
    });

    it('passes single key to client.del', async () => {
      await svc.del('key:abc');
      expect(mockCacheClient.del).toHaveBeenCalledWith('key:abc');
    });

    it('passes multiple keys to client.del', async () => {
      await svc.del('key:1', 'key:2', 'key:3');
      expect(mockCacheClient.del).toHaveBeenCalledWith('key:1', 'key:2', 'key:3');
    });
  });

  // ── delByPattern ───────────────────────────────────────────────────────────

  describe('delByPattern()', () => {
    it('returns 0 when no keys match', async () => {
      mockCacheClient.scan.mockResolvedValueOnce(['0', []]);
      const count = await svc.delByPattern('temples:*');
      expect(count).toBe(0);
    });

    it('deletes matching keys and returns count', async () => {
      mockCacheClient.scan
        .mockResolvedValueOnce(['0', ['rg:cache:temples:list:delhi', 'rg:cache:temples:list:mumbai']]);
      mockCacheClient.del.mockResolvedValueOnce(2);

      const count = await svc.delByPattern('temples:*');
      expect(count).toBe(2);
      expect(mockCacheClient.del).toHaveBeenCalledWith(
        'rg:cache:temples:list:delhi',
        'rg:cache:temples:list:mumbai',
      );
    });

    it('scans all cursor pages before returning total', async () => {
      mockCacheClient.scan
        .mockResolvedValueOnce(['cursor-1', ['rg:cache:k1']])
        .mockResolvedValueOnce(['cursor-2', ['rg:cache:k2']])
        .mockResolvedValueOnce(['0', ['rg:cache:k3']]);
      mockCacheClient.del.mockResolvedValue(1);

      const count = await svc.delByPattern('k*');
      expect(count).toBe(3);
      expect(mockCacheClient.scan).toHaveBeenCalledTimes(3);
    });

    it('uses the full rg:cache: prefix in the SCAN pattern', async () => {
      mockCacheClient.scan.mockResolvedValueOnce(['0', []]);
      await svc.delByPattern('search:*');
      const [, , pattern] = mockCacheClient.scan.mock.calls[0];
      expect(pattern).toContain('rg:cache:search:*');
    });
  });

  // ── onModuleDestroy ────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('calls client.quit', async () => {
      await svc.onModuleDestroy();
      expect(mockCacheClient.quit).toHaveBeenCalled();
    });
  });
});
