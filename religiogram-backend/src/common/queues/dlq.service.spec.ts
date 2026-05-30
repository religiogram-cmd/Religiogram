import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DlqService } from './dlq.service';
import { RedisService } from '../../redis/redis.service';
import { AlertsService } from '../alerts/alerts.service';

// ── Mock BullMQ ───────────────────────────────────────────────────────────────

const mockQeOn   = jest.fn();
const mockQeClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  QueueEvents: jest.fn().mockImplementation(() => ({
    on:    mockQeOn,
    close: mockQeClose,
  })),
}));

// ── Mock Sentry ────────────────────────────────────────────────────────────────

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/nestjs';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get:        jest.fn((key: string, def?: any) => {
    if (key === 'redis.host') return 'localhost';
    if (key === 'redis.port') return 6379;
    return def ?? null;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'redis.host') return 'localhost';
    throw new Error(`Missing ${key}`);
  }),
};

const mockRedis = {
  setEx: jest.fn().mockResolvedValue('OK'),
};

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('DlqService', () => {
  let svc: DlqService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.setEx.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService,  useValue: mockRedis },
        { provide: AlertsService, useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<DlqService>(DlqService);
  });

  // ── onModuleInit ───────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('registers listeners for all queues', async () => {
      const { ALL_QUEUES } = await import('./queue.constants');
      await svc.onModuleInit();

      // Each QueueEvents instance gets a 'failed' and 'error' handler
      const failedCalls = mockQeOn.mock.calls.filter(([ev]) => ev === 'failed');
      const errorCalls  = mockQeOn.mock.calls.filter(([ev]) => ev === 'error');
      expect(failedCalls).toHaveLength(ALL_QUEUES.length);
      expect(errorCalls).toHaveLength(ALL_QUEUES.length);
    });
  });

  // ── onModuleDestroy ────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('closes all QueueEvents listeners', async () => {
      await svc.onModuleInit();
      await svc.onModuleDestroy();
      expect(mockQeClose).toHaveBeenCalled();
    });
  });

  // ── handleFailed (via direct call) ────────────────────────────────────────

  describe('handleFailed()', () => {
    it('captures exception to Sentry', async () => {
      await (svc as any).handleFailed('email-queue', 'job-123', 'Connection refused');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({ queue: 'email-queue', jobId: 'job-123' }),
        }),
      );
    });

    it('fires an ops alert with error severity', async () => {
      await (svc as any).handleFailed('booking-queue', 'job-456', 'Timeout');
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          channel:  'dlq_job_failed',
          context:  expect.objectContaining({
            queue: 'booking-queue',
            jobId: 'job-456',
          }),
        }),
      );
    });

    it('persists DLQ entry in Redis with 7-day TTL', async () => {
      await (svc as any).handleFailed('payout-queue', 'job-789', 'DB timeout');

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'dlq:payout-queue:job-789',
        7 * 24 * 3600,
        expect.stringContaining('"queue":"payout-queue"'),
      );
    });

    it('DLQ Redis key contains both queue name and jobId', async () => {
      await (svc as any).handleFailed('wallet-queue', 'job-abc', 'Error');
      const [key] = mockRedis.setEx.mock.calls[0];
      expect(key).toContain('wallet-queue');
      expect(key).toContain('job-abc');
    });

    it('persisted JSON contains failedReason and recordedAt', async () => {
      await (svc as any).handleFailed('queue-x', 'job-1', 'Disk full');
      const [, , json] = mockRedis.setEx.mock.calls[0];
      const entry = JSON.parse(json);
      expect(entry.failedReason).toBe('Disk full');
      expect(entry.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not throw when Redis.setEx rejects', async () => {
      mockRedis.setEx.mockRejectedValueOnce(new Error('OOM'));
      await expect(
        (svc as any).handleFailed('queue-y', 'job-2', 'Failure'),
      ).resolves.not.toThrow();
    });
  });

  // ── buildRedisConnection ───────────────────────────────────────────────────

  describe('buildRedisConnection()', () => {
    it('uses sentinel config when sentinelHosts is set', async () => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        if (key === 'redis.sentinelHosts') return 'sentinel1:26379,sentinel2:26379';
        if (key === 'redis.sentinelName') return 'mymaster';
        return def ?? null;
      });

      const conn = (svc as any).buildRedisConnection();
      expect(Array.isArray(conn.sentinels)).toBe(true);
      expect(conn.sentinels).toHaveLength(2);
      expect(conn.name).toBe('mymaster');
    });

    it('uses plain host/port when no sentinelHosts', () => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        if (key === 'redis.sentinelHosts') return null;
        return def ?? null;
      });
      mockConfig.getOrThrow.mockImplementation((key: string) => {
        if (key === 'redis.host') return 'redis-host';
        throw new Error(key);
      });

      const conn = (svc as any).buildRedisConnection();
      expect(conn.host).toBe('redis-host');
    });
  });
});
