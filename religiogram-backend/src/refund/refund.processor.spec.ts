import { RefundProcessor } from './refund.processor';
import { RefundService } from './refund.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRefundService = {
  processRefund: jest.fn().mockResolvedValue(undefined),
};

function fakeJob(refundId: string, id = 'job-refund-1'): any {
  return { data: { refundId }, id };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RefundProcessor', () => {
  let processor: RefundProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new RefundProcessor(
      mockRefundService as unknown as RefundService,
    );
  });

  describe('process()', () => {
    it('calls refundService.processRefund with the refundId from job data', async () => {
      await processor.process(fakeJob('refund-abc'));
      expect(mockRefundService.processRefund).toHaveBeenCalledWith('refund-abc');
    });

    it('resolves on success', async () => {
      await expect(processor.process(fakeJob('refund-1'))).resolves.not.toThrow();
    });

    it('rethrows errors so BullMQ retries', async () => {
      mockRefundService.processRefund.mockRejectedValueOnce(new Error('Payout failed'));
      await expect(processor.process(fakeJob('refund-2'))).rejects.toThrow('Payout failed');
    });

    it('passes different refundIds to the service', async () => {
      await processor.process(fakeJob('refund-x'));
      expect(mockRefundService.processRefund).toHaveBeenCalledWith('refund-x');

      await processor.process(fakeJob('refund-y'));
      expect(mockRefundService.processRefund).toHaveBeenCalledWith('refund-y');
    });
  });
});
