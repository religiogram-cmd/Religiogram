import { ConfigService } from '@nestjs/config';
import { SmsProcessor } from './sms.processor';
import { SmsProviderService } from './sms-provider.service';
import { SMS_JOB } from './sms.queue.constants';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSmsProvider = {
  sendOtp: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {} as unknown as ConfigService;

function fakeJob(name: string, data: any, attemptsMade = 0): any {
  return { name, data, id: 'job-sms-1', attemptsMade };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SmsProcessor', () => {
  let processor: SmsProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new SmsProcessor(
      mockSmsProvider as unknown as SmsProviderService,
      mockConfig,
    );
  });

  describe('process() — SEND_OTP job', () => {
    const data = { phone: '+919876543210', otp: '123456' };

    it('calls smsProvider.sendOtp with phone and otp', async () => {
      await processor.process(fakeJob(SMS_JOB.SEND_OTP, data));
      expect(mockSmsProvider.sendOtp).toHaveBeenCalledWith(data.phone, data.otp);
    });

    it('resolves without throwing on success', async () => {
      await expect(
        processor.process(fakeJob(SMS_JOB.SEND_OTP, data)),
      ).resolves.not.toThrow();
    });
  });

  describe('process() — unknown job name', () => {
    it('does not call sendOtp', async () => {
      await processor.process(fakeJob('unknown_job', { phone: '+91999', otp: '000' }));
      expect(mockSmsProvider.sendOtp).not.toHaveBeenCalled();
    });

    it('returns undefined (no throw)', async () => {
      const result = await processor.process(
        fakeJob('unknown_job', { phone: '+91999', otp: '000' }),
      );
      expect(result).toBeUndefined();
    });
  });

  describe('process() — error handling', () => {
    it('rethrows errors so BullMQ applies retry backoff', async () => {
      mockSmsProvider.sendOtp.mockRejectedValueOnce(new Error('MSG91 timeout'));
      await expect(
        processor.process(fakeJob(SMS_JOB.SEND_OTP, { phone: '+91999', otp: '000' })),
      ).rejects.toThrow('MSG91 timeout');
    });

    it('propagates error on second attempt too', async () => {
      mockSmsProvider.sendOtp.mockRejectedValue(new Error('still down'));
      await expect(
        processor.process(fakeJob(SMS_JOB.SEND_OTP, { phone: '+91999', otp: '111' }, 1)),
      ).rejects.toThrow('still down');
    });
  });
});
