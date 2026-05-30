import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// ── Mock ioredis ───────────────────────────────────────────────────────────────

const mockRedisClient = {
  get:       jest.fn().mockResolvedValue(null),
  set:       jest.fn().mockResolvedValue('OK'),
  del:       jest.fn().mockResolvedValue(1),
  incr:      jest.fn().mockResolvedValue(1),
  expire:    jest.fn().mockResolvedValue(1),
  ttl:       jest.fn().mockResolvedValue(300),
  exists:    jest.fn().mockResolvedValue(0),
  publish:   jest.fn().mockResolvedValue(1),
  scan:      jest.fn().mockResolvedValue(['0', []]),
  quit:      jest.fn().mockResolvedValue('OK'),
  on:        jest.fn(),
  eval:      jest.fn().mockResolvedValue(1),
  pipeline:  jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

import { RedisService } from './redis.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get:        jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'redis.host':       'localhost',
      'redis.port':       6379,
      'redis.keyPrefix':  'rg:',
      'redis.tls':        false,
    };
    return map[key] ?? def;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'redis.host') return 'localhost';
    throw new Error(`Missing ${key}`);
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RedisService', () => {
  let svc: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.scan.mockResolvedValue(['0', []]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<RedisService>(RedisService);
    await svc.onModuleInit();
  });

  afterEach(async () => {
    await svc.onModuleDestroy();
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns null on cache miss', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      expect(await svc.get('some:key')).toBeNull();
    });

    it('returns the stored value on cache hit', async () => {
      mockRedisClient.get.mockResolvedValueOnce('cached-value');
      expect(await svc.get('some:key')).toBe('cached-value');
    });
  });

  // ── set ────────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('calls client.set with key and value', async () => {
      await svc.set('key', 'value');
      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value');
    });

    it('calls client.set with EX when ttl is provided', async () => {
      await svc.set('key', 'value', 'EX', 60);
      expect(mockRedisClient.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
    });
  });

  // ── setEx ──────────────────────────────────────────────────────────────────

  describe('setEx()', () => {
    it('calls client.set with EX and ttl', async () => {
      await svc.setEx('session:key', 300, 'session-data');
      expect(mockRedisClient.set).toHaveBeenCalledWith('session:key', 'session-data', 'EX', 300);
    });
  });

  // ── setNx ──────────────────────────────────────────────────────────────────

  describe('setNx()', () => {
    it('returns true when key is newly set (OK)', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK');
      expect(await svc.setNx('lock:key', '1')).toBe(true);
    });

    it('returns false when key already exists (null)', async () => {
      mockRedisClient.set.mockResolvedValueOnce(null);
      expect(await svc.setNx('lock:key', '1')).toBe(false);
    });
  });

  // ── setIfNotExists ─────────────────────────────────────────────────────────

  describe('setIfNotExists()', () => {
    it('returns true when acquired (OK)', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK');
      expect(await svc.setIfNotExists('lock:key', '1', 30)).toBe(true);
    });

    it('returns false when key already exists (null)', async () => {
      mockRedisClient.set.mockResolvedValueOnce(null);
      expect(await svc.setIfNotExists('lock:key', '1', 30)).toBe(false);
    });

    it('passes EX and NX to the client', async () => {
      await svc.setIfNotExists('lock:key', '1', 30);
      expect(mockRedisClient.set).toHaveBeenCalledWith('lock:key', '1', 'EX', 30, 'NX');
    });
  });

  // ── del ────────────────────────────────────────────────────────────────────

  describe('del()', () => {
    it('returns 0 when called with no keys', async () => {
      expect(await svc.del()).toBe(0);
    });

    it('passes all keys to client.del', async () => {
      mockRedisClient.del.mockResolvedValueOnce(2);
      expect(await svc.del('key:1', 'key:2')).toBe(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith('key:1', 'key:2');
    });
  });

  // ── incr ───────────────────────────────────────────────────────────────────

  describe('incr()', () => {
    it('returns the incremented value', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(5);
      expect(await svc.incr('counter:otp:user-1')).toBe(5);
    });
  });

  // ── expire ─────────────────────────────────────────────────────────────────

  describe('expire()', () => {
    it('delegates to client.expire', async () => {
      await svc.expire('key', 60);
      expect(mockRedisClient.expire).toHaveBeenCalledWith('key', 60);
    });
  });

  // ── exists ─────────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns true when key exists (1)', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(1);
      expect(await svc.exists('some:key')).toBe(true);
    });

    it('returns false when key does not exist (0)', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(0);
      expect(await svc.exists('some:key')).toBe(false);
    });
  });

  // ── publish ────────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('delegates to client.publish', async () => {
      mockRedisClient.publish.mockResolvedValueOnce(3);
      expect(await svc.publish('channel', 'message')).toBe(3);
    });
  });

  // ── scan ───────────────────────────────────────────────────────────────────

  describe('scan()', () => {
    it('returns [nextCursor, keys] from client.scan', async () => {
      mockRedisClient.scan.mockResolvedValueOnce(['42', ['key:1', 'key:2']]);
      const [cursor, keys] = await svc.scan('0', 'MATCH', 'key:*', 'COUNT', 100);
      expect(cursor).toBe('42');
      expect(keys).toEqual(['key:1', 'key:2']);
    });
  });

  // ── onModuleDestroy ────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('calls client.quit', async () => {
      await svc.onModuleDestroy();
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
