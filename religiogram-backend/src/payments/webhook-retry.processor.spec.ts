import { WebhookRetryProcessor } from './webhook-retry.processor';
import { PaymentsService } from './payments.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPaymentsService = {
  processWebhookEvent: jest.fn().mockResolvedValue(undefined),
};

function fakeJob(data: any, attemptsMade = 0): any {
  return { data, id: 'retry-job-1', attemptsMade };
}

const retryData = {
  event:         'payment.captured',
  payload:       { payment_id: 'pay_xyz', amount: 30000 },
  eventId:       'evt_456',
  originalJobId: 'orig-job-99',
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('WebhookRetryProcessor', () => {
  let processor: WebhookRetryProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new WebhookRetryProcessor(
      mockPaymentsService as unknown as PaymentsService,
    );
  });

  describe('process()', () => {
    it('delegates to paymentsService.processWebhookEvent', async () => {
      await processor.process(fakeJob(retryData));
      expect(mockPaymentsService.processWebhookEvent).toHaveBeenCalledWith(
        retryData.event,
        retryData.payload,
        retryData.eventId,
      );
    });

    it('works without eventId', async () => {
      const data = { event: 'order.paid', payload: {}, originalJobId: 'orig-2' };
      await processor.process(fakeJob(data));
      expect(mockPaymentsService.processWebhookEvent).toHaveBeenCalledWith(
        'order.paid',
        {},
        undefined,
      );
    });

    it('resolves on success', async () => {
      await expect(processor.process(fakeJob(retryData))).resolves.not.toThrow();
    });

    it('rethrows errors so BullMQ can fail the job', async () => {
      mockPaymentsService.processWebhookEvent.mockRejectedValueOnce(
        new Error('Razorpay API down'),
      );
      await expect(processor.process(fakeJob(retryData))).rejects.toThrow(
        'Razorpay API down',
      );
    });

    it('passes the correct payload object', async () => {
      const payload = { order_id: 'order_abc', currency: 'INR' };
      await processor.process(fakeJob({ ...retryData, payload }));
      const [, passedPayload] = mockPaymentsService.processWebhookEvent.mock.calls[0];
      expect(passedPayload).toEqual(payload);
    });
  });
});
