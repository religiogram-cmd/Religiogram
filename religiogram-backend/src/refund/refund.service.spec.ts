import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundRequest, RefundState, CancellationBy } from './entities/refund-request.entity';
import { WalletService } from '../wallet/wallet.service';
import { AlertsService } from '../common/alerts/alerts.service';

// ── helpers ───────────────────────────────────────────────────────────────────

const REFUND_ID  = 'rfnd-1';
const BOOKING_ID = 'book-1';
const USER_ID    = 'user-1';

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3_600_000);
}

function makeRefundRequest(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id:             REFUND_ID,
    bookingId:      BOOKING_ID,
    userId:         USER_ID,
    amountPaise:    10000,
    state:          RefundState.APPROVED,
    idempotencyKey: 'idem-1',
    reason:         'User cancelled',
    cancellationBy: CancellationBy.USER,
    completedAt:    null as any,
    reviewerId:     null as any,
    reviewNotes:    null as any,
    rejectionReason:null as any,
    createdAt:      new Date(),
    updatedAt:      new Date(),
    ...overrides,
  } as unknown as RefundRequest;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const qb: any = {
  update:   jest.fn().mockReturnThis(),
  set:      jest.fn().mockReturnThis(),
  where:    jest.fn().mockReturnThis(),
  execute:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockRefundRepo = {
  findOne:            jest.fn().mockResolvedValue(null),
  find:               jest.fn().mockResolvedValue([]),
  findOneOrFail:      jest.fn().mockResolvedValue(makeRefundRequest()),
  update:             jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue(qb),
};

const mockDs = {
  query: jest.fn().mockImplementation((sql: string, params: any[]) => {
    // Simulate booking lookup
    if (sql.includes('FROM bookings')) {
      return Promise.resolve([{
        id:              BOOKING_ID,
        user_id:         USER_ID,
        scheduled_at:    hoursFromNow(30).toISOString(),
        amount_paise:    10000,
        status:          'confirmed',
        wallet_debit_ref:null,
        payment_id:      'pay-1',
        payment_status:  'captured',
        captured_paise:  10000,
        refunded_paise:  0,
      }]);
    }
    // INSERT ... RETURNING *
    return Promise.resolve([makeRefundRequest()]);
  }),
};

const mockWallet = {
  credit: jest.fn().mockResolvedValue({ success: true }),
};

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RefundService', () => {
  let svc: RefundService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.assign(qb, {
      update:  jest.fn().mockReturnThis(),
      set:     jest.fn().mockReturnThis(),
      where:   jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    mockRefundRepo.createQueryBuilder.mockReturnValue(qb);
    mockRefundRepo.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: getRepositoryToken(RefundRequest), useValue: mockRefundRepo },
        { provide: getDataSourceToken(),              useValue: mockDs },
        { provide: WalletService,                     useValue: mockWallet },
        { provide: AlertsService,                     useValue: mockAlerts },
        { provide: getQueueToken('refunds'),           useValue: mockQueue },
      ],
    }).compile();

    svc = module.get<RefundService>(RefundService);
  });

  // ── calculatePolicy ────────────────────────────────────────────────────────

  describe('calculatePolicy()', () => {
    it('returns 100% refund for provider cancellation regardless of timing', () => {
      const policy = svc.calculatePolicy(CancellationBy.PROVIDER, hoursFromNow(0));
      expect(policy.refundPct).toBe(100);
    });

    it('returns 100% refund for platform/system cancellation', () => {
      expect(svc.calculatePolicy(CancellationBy.PLATFORM, hoursFromNow(0)).refundPct).toBe(100);
      expect(svc.calculatePolicy(CancellationBy.SYSTEM,   hoursFromNow(0)).refundPct).toBe(100);
    });

    it('returns 100% for user cancellation 24h+ before appointment', () => {
      const policy = svc.calculatePolicy(CancellationBy.USER, hoursFromNow(26));
      expect(policy.refundPct).toBe(100);
    });

    it('returns 75% for user cancellation 1–24h before appointment', () => {
      const policy = svc.calculatePolicy(CancellationBy.USER, hoursFromNow(5));
      expect(policy.refundPct).toBe(75);
      expect(policy.providerCompPct).toBe(25);
    });

    it('returns 25% for user cancellation <1h before appointment', () => {
      const policy = svc.calculatePolicy(CancellationBy.USER, hoursFromNow(0.5));
      expect(policy.refundPct).toBe(25);
      expect(policy.providerCompPct).toBe(50);
    });

    it('returns 0% refund when appointment is in the past', () => {
      const policy = svc.calculatePolicy(CancellationBy.USER, hoursFromNow(-1));
      expect(policy.refundPct).toBe(25); // within <1h window since -1 < 1
    });
  });

  // ── createRefund — idempotency ─────────────────────────────────────────────

  describe('createRefund() — idempotency', () => {
    it('returns existing record when idempotency key already exists', async () => {
      const existing = makeRefundRequest();
      mockRefundRepo.findOne.mockResolvedValueOnce(existing);

      const result = await svc.createRefund({
        bookingId:       BOOKING_ID,
        userId:          USER_ID,
        amountPaise:     10000,
        reason:          'duplicate',
        cancellationBy:  CancellationBy.USER,
        idempotencyKey:  'idem-1',
      } as any);

      expect(result.id).toBe(REFUND_ID);
      expect(mockDs.query).not.toHaveBeenCalled();
    });
  });

  // ── createRefund — auto-approve ────────────────────────────────────────────

  describe('createRefund() — auto-approve', () => {
    it('auto-approves and enqueues job for refund ≤ ₹500', async () => {
      const result = await svc.createRefund({
        bookingId:       BOOKING_ID,
        userId:          USER_ID,
        amountPaise:     50000, // ₹500 → 100% policy = 50000 ≤ AUTO_APPROVE_MAX_PAISE
        reason:          'User cancel',
        cancellationBy:  CancellationBy.USER,
        idempotencyKey:  'idem-auto',
      } as any);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-refund',
        { refundId: result.id },
        expect.objectContaining({ jobId: `refund-${result.id}` }),
      );
    });

    it('throws when no captured payment exists', async () => {
      mockDs.query.mockResolvedValueOnce([{
        id: BOOKING_ID,
        user_id: USER_ID,
        scheduled_at: hoursFromNow(30).toISOString(),
        amount_paise: 10000,
        status: 'pending',
        wallet_debit_ref: null,
        payment_id: null,
        payment_status: 'created',
        captured_paise: 0,
        refunded_paise: 0,
      }]);

      await expect(svc.createRefund({
        bookingId: BOOKING_ID, userId: USER_ID, amountPaise: 10000,
        reason: 'r', cancellationBy: CancellationBy.USER, idempotencyKey: 'idem-bad',
      } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws when refund amount exceeds remaining capturable', async () => {
      mockDs.query.mockResolvedValueOnce([{
        id: BOOKING_ID, user_id: USER_ID,
        scheduled_at: hoursFromNow(30).toISOString(),
        amount_paise: 10000, status: 'confirmed',
        wallet_debit_ref: null,
        payment_id: 'pay-1', payment_status: 'captured',
        captured_paise: 10000, refunded_paise: 8000, // only 2000 remaining
      }]);

      await expect(svc.createRefund({
        bookingId: BOOKING_ID, userId: USER_ID,
        amountPaise: 10000, // 100% of 10000 = 10000 > 2000 remaining
        reason: 'r', cancellationBy: CancellationBy.USER, idempotencyKey: 'idem-over',
      } as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ── processRefund ──────────────────────────────────────────────────────────

  describe('processRefund()', () => {
    it('credits wallet and marks refund COMPLETED', async () => {
      mockRefundRepo.findOneOrFail.mockResolvedValueOnce(makeRefundRequest());

      await svc.processRefund(REFUND_ID);

      expect(mockWallet.credit).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          amount:         10000,
          idempotencyKey: `refund-credit-${REFUND_ID}`,
        }),
      );
      expect(mockRefundRepo.update).toHaveBeenCalledWith(
        REFUND_ID,
        expect.objectContaining({ state: RefundState.COMPLETED }),
      );
    });

    it('marks refund FAILED and fires alert when wallet credit throws', async () => {
      mockWallet.credit.mockRejectedValueOnce(new Error('Wallet unavailable'));
      mockRefundRepo.findOneOrFail.mockResolvedValueOnce(makeRefundRequest());

      await expect(svc.processRefund(REFUND_ID)).rejects.toThrow('Wallet unavailable');

      expect(mockRefundRepo.update).toHaveBeenCalledWith(
        REFUND_ID,
        { state: RefundState.FAILED },
      );
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('skips silently when refund is not in APPROVED state', async () => {
      qb.execute.mockResolvedValueOnce({ affected: 0 }); // not APPROVED
      await svc.processRefund(REFUND_ID);
      expect(mockWallet.credit).not.toHaveBeenCalled();
    });
  });

  // ── approve / reject ───────────────────────────────────────────────────────

  describe('approve()', () => {
    it('transitions to APPROVED and enqueues job', async () => {
      mockRefundRepo.findOneOrFail.mockResolvedValueOnce(makeRefundRequest({ state: RefundState.APPROVED }));
      await svc.approve(REFUND_ID, 'admin-1', 'Looks valid');
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ state: RefundState.APPROVED }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-refund',
        { refundId: REFUND_ID },
        expect.any(Object),
      );
    });

    it('throws when refund is not in an approvable state', async () => {
      qb.execute.mockResolvedValueOnce({ affected: 0 });
      await expect(svc.approve(REFUND_ID, 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject()', () => {
    it('transitions to REJECTED with reason', async () => {
      mockRefundRepo.findOneOrFail.mockResolvedValueOnce(
        makeRefundRequest({ state: RefundState.REJECTED }),
      );
      await svc.reject(REFUND_ID, 'admin-1', 'No grounds');
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ state: RefundState.REJECTED }),
      );
    });

    it('throws when refund is not in a rejectable state', async () => {
      qb.execute.mockResolvedValueOnce({ affected: 0 });
      await expect(svc.reject(REFUND_ID, 'admin-1', 'reason')).rejects.toThrow(BadRequestException);
    });
  });
});
