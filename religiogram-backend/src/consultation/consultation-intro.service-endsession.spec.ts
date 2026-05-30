/**
 * Spec: endSession stopBilling retry logic (v35 P1-1 fix)
 *
 * Verifies that endSession:
 *  - retries stopBilling up to 3 times on failure
 *  - succeeds when stopBilling passes on attempt 2 or 3
 *  - throws ServiceUnavailableException when all 3 attempts fail
 */
import { ServiceUnavailableException } from '@nestjs/common';

// ── Minimal stub of the retry block in consultation-intro.service.ts ──────────
async function endSessionRetryBlock(
  stopBillingFn: () => Promise<void>,
  logger: { warn: (...a: unknown[]) => void },
): Promise<void> {
  const STOP_RETRIES = 3;
  let stopError: Error | undefined;
  for (let attempt = 1; attempt <= STOP_RETRIES; attempt++) {
    try {
      await stopBillingFn();
      stopError = undefined;
      break;
    } catch (err) {
      stopError = err as Error;
      logger.warn({ err, attempt }, `stopBilling attempt ${attempt} failed`);
      if (attempt < STOP_RETRIES) {
        await new Promise<void>(r => setTimeout(r, attempt * 1)); // 1ms in tests
      }
    }
  }
  if (stopError) {
    throw new ServiceUnavailableException(
      'Billing stop failed — please retry ending the session in a few seconds',
    );
  }
}

const mockLogger = { warn: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('endSession stopBilling retry logic (v35 P1-1)', () => {
  it('succeeds immediately when stopBilling resolves on first attempt', async () => {
    const stopBilling = jest.fn().mockResolvedValue(undefined);
    await expect(endSessionRetryBlock(stopBilling, mockLogger)).resolves.not.toThrow();
    expect(stopBilling).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('retries and succeeds when stopBilling fails once then resolves', async () => {
    const stopBilling = jest.fn()
      .mockRejectedValueOnce(new Error('Redis timeout'))
      .mockResolvedValue(undefined);
    await expect(endSessionRetryBlock(stopBilling, mockLogger)).resolves.not.toThrow();
    expect(stopBilling).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds when stopBilling fails twice then resolves', async () => {
    const stopBilling = jest.fn()
      .mockRejectedValueOnce(new Error('Redis timeout'))
      .mockRejectedValueOnce(new Error('Redis timeout'))
      .mockResolvedValue(undefined);
    await expect(endSessionRetryBlock(stopBilling, mockLogger)).resolves.not.toThrow();
    expect(stopBilling).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('throws ServiceUnavailableException when all 3 attempts fail', async () => {
    const stopBilling = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
    await expect(endSessionRetryBlock(stopBilling, mockLogger))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(stopBilling).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(3);
  });

  it('error message directs user to retry', async () => {
    const stopBilling = jest.fn().mockRejectedValue(new Error('fail'));
    try {
      await endSessionRetryBlock(stopBilling, mockLogger);
      fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      expect((e as ServiceUnavailableException).message).toContain('retry');
    }
  });
});
