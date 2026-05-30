import { EventRemindersScheduler } from './event-reminders.scheduler';
import { REMINDER_DISPATCH_JOB } from './event-reminders.processor';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('EventRemindersScheduler', () => {
  let scheduler: EventRemindersScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new EventRemindersScheduler(mockQueue as any);
  });

  describe('onModuleInit()', () => {
    it('adds a job to the queue', async () => {
      await scheduler.onModuleInit();
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('enqueues the correct job name', async () => {
      await scheduler.onModuleInit();
      const [jobName] = mockQueue.add.mock.calls[0];
      expect(jobName).toBe(REMINDER_DISPATCH_JOB);
    });

    it('uses stable jobId to prevent duplicates across pods', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.jobId).toBe('event-reminder-dispatch-repeatable');
    });

    it('schedules with 60s repeat interval', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.repeat.every).toBe(60 * 1000);
    });

    it('sets attempts to 3 for transient-error retries', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.attempts).toBe(3);
    });

    it('uses exponential backoff', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.backoff?.type).toBe('exponential');
    });

    it('keeps 500 completed runs in history', async () => {
      await scheduler.onModuleInit();
      const [, , opts] = mockQueue.add.mock.calls[0];
      expect(opts.removeOnComplete.count).toBe(500);
    });
  });
});
