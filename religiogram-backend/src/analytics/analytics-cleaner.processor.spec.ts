import { AnalyticsCleanerProcessor } from './analytics-cleaner.processor';
import { AnalyticsService } from './analytics.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAnalytics = {
  sweepOld: jest.fn(),
};

function fakeJob(name = 'sweep-old', id = 'job-1'): any {
  return { name, id };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AnalyticsCleanerProcessor', () => {
  let processor: AnalyticsCleanerProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new AnalyticsCleanerProcessor(
      mockAnalytics as unknown as AnalyticsService,
    );
  });

  describe('process()', () => {
    it('delegates to analytics.sweepOld(30)', async () => {
      mockAnalytics.sweepOld.mockResolvedValueOnce({ deleted: 500, cutoffIso: '2024-01-01T00:00:00.000Z' });
      const job = fakeJob();
      await processor.process(job);
      expect(mockAnalytics.sweepOld).toHaveBeenCalledWith(30);
    });

    it('returns the result from sweepOld', async () => {
      const expected = { deleted: 120, cutoffIso: '2024-04-01T00:00:00.000Z' };
      mockAnalytics.sweepOld.mockResolvedValueOnce(expected);
      const result = await processor.process(fakeJob());
      expect(result).toEqual(expected);
    });

    it('propagates errors from sweepOld so BullMQ can retry', async () => {
      mockAnalytics.sweepOld.mockRejectedValueOnce(new Error('DB timeout'));
      await expect(processor.process(fakeJob())).rejects.toThrow('DB timeout');
    });

    it('uses the 30-day retention regardless of job name', async () => {
      mockAnalytics.sweepOld.mockResolvedValueOnce({ deleted: 0, cutoffIso: '' });
      await processor.process(fakeJob('some-other-name'));
      expect(mockAnalytics.sweepOld).toHaveBeenCalledWith(30);
    });
  });
});
