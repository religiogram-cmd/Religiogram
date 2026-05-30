import { EventRemindersDispatcherProcessor } from './event-reminders.processor';
import { EventRemindersService } from './event-reminders.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReminders = {
  dispatchDue: jest.fn(),
};

function fakeJob(name = 'dispatch-due', id = 'job-rem-1'): any {
  return { name, id };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('EventRemindersDispatcherProcessor', () => {
  let processor: EventRemindersDispatcherProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new EventRemindersDispatcherProcessor(
      mockReminders as unknown as EventRemindersService,
    );
  });

  describe('process()', () => {
    it('calls reminders.dispatchDue with a Date', async () => {
      const result = { picked: 5, sent: 5, failed: 0 };
      mockReminders.dispatchDue.mockResolvedValueOnce(result);

      const before = Date.now();
      await processor.process(fakeJob());
      const after = Date.now();

      expect(mockReminders.dispatchDue).toHaveBeenCalledTimes(1);
      const [calledWith] = mockReminders.dispatchDue.mock.calls[0];
      expect(calledWith).toBeInstanceOf(Date);
      expect(calledWith.getTime()).toBeGreaterThanOrEqual(before);
      expect(calledWith.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns the dispatch result', async () => {
      const expected = { picked: 3, sent: 2, failed: 1 };
      mockReminders.dispatchDue.mockResolvedValueOnce(expected);
      const result = await processor.process(fakeJob());
      expect(result).toEqual(expected);
    });

    it('returns zero counts when nothing is due', async () => {
      const expected = { picked: 0, sent: 0, failed: 0 };
      mockReminders.dispatchDue.mockResolvedValueOnce(expected);
      const result = await processor.process(fakeJob());
      expect(result).toEqual(expected);
    });

    it('propagates errors so BullMQ retries', async () => {
      mockReminders.dispatchDue.mockRejectedValueOnce(new Error('Redis gone'));
      await expect(processor.process(fakeJob())).rejects.toThrow('Redis gone');
    });
  });
});
