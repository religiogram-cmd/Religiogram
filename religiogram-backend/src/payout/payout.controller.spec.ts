import { Test, TestingModule } from '@nestjs/testing';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPayoutService = {
  getProviderEarnings: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getProviderPayouts:  jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getPendingEarnings:  jest.fn().mockResolvedValue({ pendingPaise: 0, count: 0 }),
  scheduleBatch:       jest.fn().mockResolvedValue({ batchId: 'batch-1', status: 'scheduled' }),
  processBatch:        jest.fn().mockResolvedValue({ batchId: 'batch-1', status: 'processed' }),
};

function fakeUser(id = 'user-1'): any {
  return { id };
}

const FAKE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PayoutController', () => {
  let ctrl: PayoutController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutController],
      providers: [
        { provide: PayoutService, useValue: mockPayoutService },
      ],
    }).compile();

    ctrl = module.get<PayoutController>(PayoutController);
  });

  // ── getProviderEarnings() ──────────────────────────────────────────────────

  describe('getProviderEarnings()', () => {
    it('delegates to payoutService with userId, page, limit', async () => {
      const result = await ctrl.getProviderEarnings(fakeUser(), 1, 20);
      expect(mockPayoutService.getProviderEarnings).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result).toHaveProperty('data');
    });

    it('passes custom page and limit', async () => {
      await ctrl.getProviderEarnings(fakeUser(), 3, 50);
      expect(mockPayoutService.getProviderEarnings).toHaveBeenCalledWith('user-1', 3, 50);
    });
  });

  // ── getProviderPayouts() ───────────────────────────────────────────────────

  describe('getProviderPayouts()', () => {
    it('delegates to payoutService with userId, page, limit', async () => {
      const result = await ctrl.getProviderPayouts(fakeUser(), 1, 20);
      expect(mockPayoutService.getProviderPayouts).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result).toHaveProperty('data');
    });

    it('passes custom page and limit', async () => {
      await ctrl.getProviderPayouts(fakeUser(), 2, 10);
      expect(mockPayoutService.getProviderPayouts).toHaveBeenCalledWith('user-1', 2, 10);
    });
  });

  // ── getPendingEarnings() ───────────────────────────────────────────────────

  describe('getPendingEarnings()', () => {
    it('delegates to payoutService.getPendingEarnings with userId', async () => {
      mockPayoutService.getPendingEarnings.mockResolvedValueOnce({ pendingPaise: 25_000, count: 5 });
      const result = await ctrl.getPendingEarnings(fakeUser());
      expect(mockPayoutService.getPendingEarnings).toHaveBeenCalledWith('user-1');
      expect(result.pendingPaise).toBe(25_000);
    });
  });

  // ── scheduleBatch() ────────────────────────────────────────────────────────

  describe('scheduleBatch()', () => {
    it('delegates to payoutService.scheduleBatch with userId', async () => {
      mockPayoutService.scheduleBatch.mockResolvedValueOnce({ batchId: 'batch-42', status: 'scheduled' });
      const result = await ctrl.scheduleBatch(fakeUser());
      expect(mockPayoutService.scheduleBatch).toHaveBeenCalledWith('user-1');
      expect(result.batchId).toBe('batch-42');
    });
  });

  // ── processBatch() ─────────────────────────────────────────────────────────

  describe('processBatch()', () => {
    it('delegates to payoutService.processBatch with batch id', async () => {
      mockPayoutService.processBatch.mockResolvedValueOnce({ batchId: FAKE_UUID, status: 'processed' });
      const result = await ctrl.processBatch(FAKE_UUID);
      expect(mockPayoutService.processBatch).toHaveBeenCalledWith(FAKE_UUID);
      expect(result.batchId).toBe(FAKE_UUID);
    });
  });
});
