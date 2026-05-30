import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AdminPaymentsController } from './admin-payments.controller';
import { RedisService } from '../redis/redis.service';
import { QUEUE } from '../common/queues/queue.constants';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRedisService = {
  scanKeys: jest.fn().mockResolvedValue([]),
  mget:     jest.fn().mockResolvedValue([]),
};

const mockRetryQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-42' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminPaymentsController', () => {
  let ctrl: AdminPaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPaymentsController],
      providers: [
        { provide: RedisService,                            useValue: mockRedisService },
        { provide: getQueueToken(QUEUE.WEBHOOK_RETRY),      useValue: mockRetryQueue },
      ],
    }).compile();

    ctrl = module.get<AdminPaymentsController>(AdminPaymentsController);
  });

  // ── listDlq() ─────────────────────────────────────────────────────────────

  describe('listDlq()', () => {
    it('returns {total:0, entries:[]} when no keys found', async () => {
      const result = await ctrl.listDlq(undefined, undefined);
      expect(result).toEqual({ total: 0, entries: [] });
    });

    it('uses "dlq:*" pattern when no queue filter', async () => {
      await ctrl.listDlq(undefined, '10');
      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('dlq:*', 10);
    });

    it('uses "dlq:{queue}:*" pattern when queue filter provided', async () => {
      await ctrl.listDlq('payment-webhook', undefined);
      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('dlq:payment-webhook:*', 50);
    });

    it('parses JSON entries from Redis values', async () => {
      const entry = { event: 'payment.failed', payload: {} };
      mockRedisService.scanKeys.mockResolvedValueOnce(['dlq:payment-webhook:job-1']);
      mockRedisService.mget.mockResolvedValueOnce([JSON.stringify(entry)]);

      const result = await ctrl.listDlq(undefined, '5');
      expect(result.total).toBe(1);
      expect(result.entries[0]).toEqual(entry);
    });

    it('handles invalid JSON gracefully', async () => {
      mockRedisService.scanKeys.mockResolvedValueOnce(['dlq:x:1']);
      mockRedisService.mget.mockResolvedValueOnce(['{invalid json']);

      const result = await ctrl.listDlq(undefined, undefined);
      expect(result.entries[0]).toHaveProperty('raw');
    });

    it('clamps limit to max 200', async () => {
      await ctrl.listDlq(undefined, '9999');
      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('dlq:*', 200);
    });

    it('filters out null mget values', async () => {
      mockRedisService.scanKeys.mockResolvedValueOnce(['k1', 'k2']);
      mockRedisService.mget.mockResolvedValueOnce([JSON.stringify({ a: 1 }), null]);

      const result = await ctrl.listDlq(undefined, undefined);
      expect(result.entries).toHaveLength(1);
    });
  });

  // ── replayWebhook() ───────────────────────────────────────────────────────

  describe('replayWebhook()', () => {
    it('enqueues job and returns jobId + status:queued', async () => {
      const dto = { event: 'payment.captured', payload: { razorpay_payment_id: 'pay_1' }, eventId: 'evt-1' };
      const result = await ctrl.replayWebhook(dto);
      expect(mockRetryQueue.add).toHaveBeenCalledWith(
        'replay',
        expect.objectContaining({ event: 'payment.captured', payload: dto.payload }),
        expect.any(Object),
      );
      expect(result).toEqual({ jobId: 'job-42', status: 'queued' });
    });

    it('throws BadRequestException when event is missing', async () => {
      const dto: any = { payload: {} };
      await expect(ctrl.replayWebhook(dto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when payload is not an object', async () => {
      const dto: any = { event: 'test', payload: 'not-an-object' };
      await expect(ctrl.replayWebhook(dto)).rejects.toThrow(BadRequestException);
    });
  });
});
