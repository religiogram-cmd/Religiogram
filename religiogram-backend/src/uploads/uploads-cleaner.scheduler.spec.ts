import { UploadsCleanerScheduler } from './uploads-cleaner.scheduler';
import {
  UPLOADS_CLEANUP_JOB,
  UPLOADS_CLEANUP_QUEUE,
} from './uploads-cleaner.processor';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UploadsCleanerScheduler', () => {
  let scheduler: UploadsCleanerScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new UploadsCleanerScheduler(mockQueue as any);
  });

  describe('onModuleInit()', () => {
    it('adds exactly one job to the queue', async () => {
      await scheduler.onModuleInit();
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('enqueues the correct job name', async () => {
      await scheduler.onModuleInit();
      const [jobName] = mockQueue.add.mock.calls[0];
      expect(jobName).toBe(UPLOADS_CLEANUP_JOB);
    });

    it('uses stable jobId to prevent multi-pod duplicates', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.jobId).toBe('uploads-cleanup-repeatable');
    });

    it('schedules with 10-minute repeat interval', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.repeat.every).toBe(10 * 60 * 1000);
    });

    it('keeps 10 completed results', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.removeOnComplete.count).toBe(10);
    });

    it('keeps 20 failed results', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.removeOnFail.count).toBe(20);
    });
  });
});
