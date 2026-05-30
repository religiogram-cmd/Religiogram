import { PaymentWebhookProcessor } from './payment-webhook.processor';
import { PaymentsService, WEBHOOK_JOB_PROCESS } from './payments.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPaymentsService = {
  processWebhookEvent: jest.fn().mockResolvedValue(undefined),
};

function fakeJob(name: string, data: any, attemptsMade = 0): any {
  return { name, data, id: 'wh-job-1', attemptsMade };
}

const webhookData = {
  event:   'payment.captured',
  payload: { payment_id: 'pay_abc', amount: 50000 },
  eventId: 'evt_123',
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PaymentWebhookProcessor', () => {
  let processor: PaymentWebhookProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PaymentWebhookProcessor(
      mockPaymentsService as unknown as PaymentsService,
    );
  });

  describe('process() — known job name', () => {
    it('delegates to paymentsService.processWebhookEvent', async () => {
      await processor.process(fakeJob(WEBHOOK_JOB_PROCESS, webhookData));
      expect(mockPaymentsService.processWebhookEvent).toHaveBeenCalledWith(
        webhookData.event,
        webhookData.payload,
        webhookData.eventId,
      );
    });

    it('passes undefined eventId when absent', async () => {
      const data = { event: 'payment.failed', payload: {} };
      await processor.process(fakeJob(WEBHOOK_JOB_PROCESS, data));
      expect(mockPaymentsService.processWebhookEvent).toHaveBeenCalledWith(
        'payment.failed',
        {},
        undefined,
      );
    });

    it('resolves on success', async () => {
      await expect(
        processor.process(fakeJob(WEBHOOK_JOB_PROCESS, webhookData)),
      ).resolves.not.toThrow();
    });
  });

  describe('process() — unknown job name', () => {
    it('does not call processWebhookEvent', async () => {
      await processor.process(fakeJob('other_job', webhookData));
      expect(mockPaymentsService.processWebhookEvent).not.toHaveBeenCalled();
    });

    it('returns without throwing', async () => {
      await expect(
        processor.process(fakeJob('other_job', webhookData)),
      ).resolves.toBeUndefined();
    });
  });

  describe('process() — error propagation', () => {
    it('rethrows so BullMQ retries', async () => {
      mockPaymentsService.processWebhookEvent.mockRejectedValueOnce(
        new Error('DB deadlock'),
      );
      await expect(
        processor.process(fakeJob(WEBHOOK_JOB_PROCESS, webhookData)),
      ).rejects.toThrow('DB deadlock');
    });
  });
});
