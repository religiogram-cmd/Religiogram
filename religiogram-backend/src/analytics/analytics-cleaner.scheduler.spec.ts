import { AnalyticsCleanerScheduler } from './analytics-cleaner.scheduler';
import {
  ANALYTICS_CLEANUP_JOB,
  ANALYTICS_CLEANUP_QUEUE,
} from './analytics-cleaner.processor';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AnalyticsCleanerScheduler', () => {
  let scheduler: AnalyticsCleanerScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new AnalyticsCleanerScheduler(mockQueue as any);
  });

  describe('onModuleInit()', () => {
    it('adds a job to the queue on module init', async () => {
      await scheduler.onModuleInit();
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('enqueues the correct job name', async () => {
      await scheduler.onModuleInit();
      const [jobName] = mockQueue.add.mock.calls[0];
      expect(jobName).toBe(ANALYTICS_CLEANUP_JOB);
    });

    it('uses a stable jobId to prevent duplicate schedules', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.jobId).toBe('analytics-cleanup-repeatable');
    });

    it('schedules with a repeat.every interval of 24 hours in ms', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.repeat.every).toBe(24 * 60 * 60 * 1000);
    });

    it('sets removeOnComplete to keep 30 runs', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.removeOnComplete.count).toBe(30);
    });

    it('is idempotent — calling twice enqueues twice (BullMQ deduplicates by jobId)', async () => {
      await scheduler.onModuleInit();
      await scheduler.onModuleInit();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });
});
