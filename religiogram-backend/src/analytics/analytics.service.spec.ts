import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './entities/analytics-event.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockEventsRepo = {
  insert: jest.fn().mockResolvedValue(undefined),
  query:  jest.fn().mockResolvedValue([]),  // 0 rows deleted by default
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let svc: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEventsRepo.insert.mockResolvedValue(undefined);
    mockEventsRepo.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(AnalyticsEvent), useValue: mockEventsRepo },
      ],
    }).compile();

    svc = module.get<AnalyticsService>(AnalyticsService);
  });

  // ── record ─────────────────────────────────────────────────────────────────

  describe('record()', () => {
    const baseParams = {
      dto: { eventType: 'page_view', metadata: { page: '/home' } },
      userId: 'user-1',
      ip: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    };

    it('inserts event with correct fields', async () => {
      await svc.record(baseParams);
      expect(mockEventsRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'page_view',
          ip: '1.2.3.4',
        }),
      );
    });

    it('accepts null userId (anonymous events)', async () => {
      await svc.record({ ...baseParams, userId: null });
      expect(mockEventsRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
      );
    });

    it('truncates userAgent to 400 chars', async () => {
      const longUa = 'A'.repeat(600);
      await svc.record({ ...baseParams, userAgent: longUa });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.userAgent.length).toBe(400);
    });

    it('is non-fatal — does not throw when insert fails', async () => {
      mockEventsRepo.insert.mockRejectedValueOnce(new Error('DB down'));
      await expect(svc.record(baseParams)).resolves.not.toThrow();
    });

    it('strips forbidden PII keys from metadata', async () => {
      const metaPii = {
        email: 'user@example.com',
        phone: '+91987654',
        name: 'John',
        page: '/checkout',
      };
      await svc.record({ ...baseParams, dto: { eventType: 'checkout', metadata: metaPii } });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.metadata).not.toHaveProperty('email');
      expect(call.metadata).not.toHaveProperty('phone');
      expect(call.metadata).not.toHaveProperty('name');
      expect(call.metadata).toHaveProperty('page', '/checkout');
    });

    it('strips keys case-insensitively (e.g. Email, JWT, ApiKey)', async () => {
      const meta: Record<string, unknown> = {
        Email: 'x@y.com',
        JWT: 'tok.en.val',
        ApiKey: 'secret123',
        action: 'buy',
      };
      await svc.record({ ...baseParams, dto: { eventType: 'evt', metadata: meta } });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.metadata).not.toHaveProperty('Email');
      expect(call.metadata).not.toHaveProperty('JWT');
      expect(call.metadata).not.toHaveProperty('ApiKey');
      expect(call.metadata).toHaveProperty('action', 'buy');
    });

    it('caps string values at 500 chars', async () => {
      const meta = { longVal: 'x'.repeat(600) };
      await svc.record({ ...baseParams, dto: { eventType: 'evt', metadata: meta } });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.metadata.longVal.length).toBe(500);
    });

    it('caps array values at 20 items', async () => {
      const meta = { items: Array.from({ length: 30 }, (_, i) => i) };
      await svc.record({ ...baseParams, dto: { eventType: 'evt', metadata: meta } });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.metadata.items.length).toBe(20);
    });

    it('passes through boolean, number, and null values unchanged', async () => {
      const meta = { active: true, count: 42, ref: null };
      await svc.record({ ...baseParams, dto: { eventType: 'evt', metadata: meta } });
      const call = mockEventsRepo.insert.mock.calls[0][0];
      expect(call.metadata.active).toBe(true);
      expect(call.metadata.count).toBe(42);
      expect(call.metadata.ref).toBeNull();
    });
  });

  // ── sweepOld ───────────────────────────────────────────────────────────────

  describe('sweepOld()', () => {
    it('returns deleted=0 and a cutoffIso when no rows exist', async () => {
      mockEventsRepo.query.mockResolvedValueOnce([]); // 0 rows in first batch

      const result = await svc.sweepOld(30);

      expect(result.deleted).toBe(0);
      expect(result.cutoffIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('executes batched DELETE with correct cutoff date', async () => {
      await svc.sweepOld(30, 1000);

      expect(mockEventsRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM analytics_events'),
        expect.any(Array),
      );
      const [, params] = mockEventsRepo.query.mock.calls[0];
      // First param is cutoff ISO string, second is batch size
      expect(new Date(params[0]).getTime()).toBeLessThan(Date.now());
      expect(params[1]).toBe(1000);
    });

    it('accumulates total from multiple batches', async () => {
      const batchSize = 5;
      // First batch: full (5 rows), second batch: partial (3 rows) → stops
      mockEventsRepo.query
        .mockResolvedValueOnce(Array(batchSize).fill({ deleted: 1 })) // full batch
        .mockResolvedValueOnce(Array(3).fill({ deleted: 1 }));         // partial

      const result = await svc.sweepOld(30, batchSize);
      expect(result.deleted).toBe(8);
    });

    it('stops looping when a batch returns fewer rows than batchSize', async () => {
      mockEventsRepo.query
        .mockResolvedValueOnce(Array(10).fill({ deleted: 1 })) // full
        .mockResolvedValueOnce(Array(4).fill({ deleted: 1 })); // partial → stop

      const result = await svc.sweepOld(30, 10);
      expect(mockEventsRepo.query).toHaveBeenCalledTimes(2);
      expect(result.deleted).toBe(14);
    });

    it('uses default retention of 30 days when not specified', async () => {
      await svc.sweepOld(); // no args
      const [, params] = mockEventsRepo.query.mock.calls[0];
      const cutoff = new Date(params[0]);
      const expectedCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      // Should be within 5 seconds of expected
      expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(5000);
    });
  });
});
