import { PushNotificationProcessor } from './push-notification.processor';
import { NotificationsService } from '../notifications.service';
import { PUSH_JOB } from '../push-notification.queue';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockNotificationsService = {
  sendPushToUser:  jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
};

function fakeJob(name: string, data: any, attemptsMade = 0): any {
  return { name, data, id: 'job-1', attemptsMade };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PushNotificationProcessor', () => {
  let processor: PushNotificationProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PushNotificationProcessor(
      mockNotificationsService as unknown as NotificationsService,
    );
  });

  describe('process() — SEND_SINGLE', () => {
    const singleData = {
      userId: 'user-1',
      title:  'New message',
      body:   'You have a new message',
      data:   { bookingId: 'bk-1' },
    };

    it('calls sendPushToUser with correct args', async () => {
      await processor.process(fakeJob(PUSH_JOB.SEND_SINGLE, singleData));
      expect(mockNotificationsService.sendPushToUser).toHaveBeenCalledWith(
        singleData.userId,
        singleData.title,
        singleData.body,
        singleData.data,
      );
    });

    it('does not call sendPushToUsers for a single job', async () => {
      await processor.process(fakeJob(PUSH_JOB.SEND_SINGLE, singleData));
      expect(mockNotificationsService.sendPushToUsers).not.toHaveBeenCalled();
    });
  });

  describe('process() — SEND_BATCH', () => {
    const batchData = {
      userIds: ['user-1', 'user-2', 'user-3'],
      title:   'Festival special',
      body:    'Special offers inside',
      data:    { promoId: 'promo-1' },
    };

    it('calls sendPushToUsers with correct args', async () => {
      await processor.process(fakeJob(PUSH_JOB.SEND_BATCH, batchData));
      expect(mockNotificationsService.sendPushToUsers).toHaveBeenCalledWith(
        batchData.userIds,
        batchData.title,
        batchData.body,
        batchData.data,
      );
    });

    it('does not call sendPushToUser for a batch job', async () => {
      await processor.process(fakeJob(PUSH_JOB.SEND_BATCH, batchData));
      expect(mockNotificationsService.sendPushToUser).not.toHaveBeenCalled();
    });
  });

  describe('process() — unknown job name', () => {
    it('does not call either service method', async () => {
      await processor.process(fakeJob('unknown_job', {}));
      expect(mockNotificationsService.sendPushToUser).not.toHaveBeenCalled();
      expect(mockNotificationsService.sendPushToUsers).not.toHaveBeenCalled();
    });

    it('resolves without throwing', async () => {
      await expect(processor.process(fakeJob('unknown_job', {}))).resolves.not.toThrow();
    });
  });

  describe('process() — error propagation', () => {
    it('rethrows errors so BullMQ can retry', async () => {
      mockNotificationsService.sendPushToUser.mockRejectedValueOnce(
        new Error('FCM unavailable'),
      );
      await expect(
        processor.process(fakeJob(PUSH_JOB.SEND_SINGLE, { userId: 'u', title: 't', body: 'b' })),
      ).rejects.toThrow('FCM unavailable');
    });
  });
});
