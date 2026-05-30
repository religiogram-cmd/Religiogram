import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisService } from '../redis/redis.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDb = {
  query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue({
    ping: jest.fn().mockResolvedValue('PONG'),
    keys: jest.fn().mockResolvedValue([]),
    llen: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
  }),
  ping: jest.fn().mockResolvedValue('PONG'),
};

const mockCb = {
  status: jest.fn().mockReturnValue({ razorpay: 'CLOSED', fcm: 'CLOSED' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  let ctrl: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDataSourceToken(),  useValue: mockDb },
        { provide: RedisService,          useValue: mockRedis },
        { provide: CircuitBreakerService, useValue: mockCb },
      ],
    }).compile();

    ctrl = module.get<HealthController>(HealthController);
  });

  // ── liveness ───────────────────────────────────────────────────────────────

  describe('liveness()', () => {
    it('returns status ok with process fields', () => {
      const result = ctrl.liveness();
      expect(result.status).toBe('ok');
      expect(result.pid).toBe(process.pid);
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('timestamp is an ISO date string', () => {
      const result = ctrl.liveness();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not call DB or Redis', () => {
      ctrl.liveness();
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(mockRedis.ping).not.toHaveBeenCalled();
    });
  });

  // ── readiness ──────────────────────────────────────────────────────────────

  describe('readiness()', () => {
    it('returns status ok when DB and Redis are healthy', async () => {
      const result = await ctrl.readiness();
      expect(result.status).toBe('ok');
      expect(result.checks.db).toBe(true);
      expect(result.checks.redis).toBe(true);
    });

    it('includes circuit breaker states', async () => {
      const result = await ctrl.readiness();
      expect(result.circuits).toEqual({ razorpay: 'CLOSED', fcm: 'CLOSED' });
    });

    it('includes memory usage in MB', async () => {
      const result = await ctrl.readiness();
      expect(typeof result.memory.heapUsedMb).toBe('number');
      expect(typeof result.memory.rssMb).toBe('number');
    });

    it('includes uptime and timestamp', async () => {
      const result = await ctrl.readiness();
      expect(typeof result.uptime).toBe('number');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns status degraded when DB is unreachable', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('connection refused'));
      const result = await ctrl.readiness();
      expect(result.status).toBe('degraded');
      expect(result.checks.db).toBe(false);
    });
  });
});
