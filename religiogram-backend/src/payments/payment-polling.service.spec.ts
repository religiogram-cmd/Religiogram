import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentPollingService } from './payment-polling.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { AlertsService } from '../common/alerts/alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

function makePayment(overrides: any = {}): Payment {
  return {
    id:                'pay-1',
    bookingId:         'bk-1',
    razorpayOrderId:   'order_test_1',
    razorpayPaymentId: null,
    status:            PaymentStatus.CREATED,
    amountPaise:       5000,
    failureReason:     null,
    createdAt:         new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
    ...overrides,
  } as unknown as Payment;
}

const mockQBUpdate = {
  update:  jest.fn().mockReturnThis(),
  set:     jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockPaymentRepo = {
  find:               jest.fn().mockResolvedValue([]),
  update:             jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn(() => mockQBUpdate),
};

const mockBookingRepo = {
  find: jest.fn().mockResolvedValue([]),
};

const mockBookingsService = {
  confirmBooking:    jest.fn().mockResolvedValue(undefined),
  markPaymentFailed: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    if (key === 'razorpay.keyId')     return 'rzp_test_key';
    if (key === 'razorpay.keySecret') return 'rzp_test_secret';
    return def ?? null;
  }),
};

const mockAlerts = { fire: jest.fn().mockResolvedValue(undefined) };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PaymentPollingService', () => {
  let svc: PaymentPollingService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPaymentRepo.find.mockResolvedValue([]);
    mockQBUpdate.execute.mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentPollingService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepo },
        { provide: BookingsService,             useValue: mockBookingsService },
        { provide: ConfigService,               useValue: mockConfig },
        { provide: AlertsService,               useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<PaymentPollingService>(PaymentPollingService);

    // Mock global fetch for Razorpay API calls
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 'created', attempts: 0, amount: 5000 }),
    } as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── pollPendingOrders ──────────────────────────────────────────────────────

  describe('pollPendingOrders()', () => {
    it('returns early without calling fetch when no pending payments exist', async () => {
      mockPaymentRepo.find.mockResolvedValueOnce([]);
      await svc.pollPendingOrders();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls fetchOrder for each pending payment', async () => {
      const payments = [makePayment(), makePayment({ id: 'pay-2', razorpayOrderId: 'order_2' })];
      mockPaymentRepo.find.mockResolvedValueOnce(payments);
      fetchSpy.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ status: 'created', attempts: 0, amount: 5000 }) } as any);

      await svc.pollPendingOrders();
      // 2 payments → 2 fetchOrder calls (each fetches the order)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── checkOrder — paid path ─────────────────────────────────────────────────

  describe('checkOrder() — order is paid', () => {
    it('captures payment and confirms booking on paid order with matching amount', async () => {
      const payment = makePayment({ amountPaise: 5000 });
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);

      // fetchOrder returns paid; fetchOrderPayments returns captured payment
      fetchSpy
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ status: 'paid', attempts: 1, amount: 5000 }) } as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ items: [{ id: 'pay_cap_1', status: 'captured', amount: 5000 }] }) } as any);

      await svc.pollPendingOrders();

      expect(mockQBUpdate.execute).toHaveBeenCalled();
      expect(mockBookingsService.confirmBooking).toHaveBeenCalledWith('bk-1', 'pay-1');
    });

    it('marks payment as failed when captured amount mismatches', async () => {
      const payment = makePayment({ amountPaise: 5000 });
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);

      fetchSpy
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ status: 'paid', attempts: 1, amount: 5000 }) } as any)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ items: [{ id: 'pay_cap_1', status: 'captured', amount: 9999 }] }) } as any);

      await svc.pollPendingOrders();

      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
      expect(mockBookingsService.confirmBooking).not.toHaveBeenCalled();
    });
  });

  // ── checkOrder — expired path ──────────────────────────────────────────────

  describe('checkOrder() — order expired', () => {
    it('marks payment as failed and calls markPaymentFailed', async () => {
      const payment = makePayment();
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'expired', attempts: 3, amount: 5000 }),
      } as any);

      await svc.pollPendingOrders();
      expect(mockBookingsService.markPaymentFailed).toHaveBeenCalledWith('bk-1', expect.any(String));
    });
  });

  // ── fetchOrder error handling ──────────────────────────────────────────────

  describe('fetchOrder() error handling', () => {
    it('returns null (no-op) when razorpayOrderId is null', async () => {
      const payment = makePayment({ razorpayOrderId: null });
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);
      await svc.pollPendingOrders();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fires a warn alert when checkOrder throws', async () => {
      const payment = makePayment();
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);

      // fetchOrder returns ok but json throws
      fetchSpy.mockResolvedValueOnce({ ok: true, json: jest.fn().mockRejectedValue(new Error('parse error')) } as any);

      await svc.pollPendingOrders();
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'warn', channel: 'payment_failure' }),
      );
    });
  });

  // ── expireStaleOrders ──────────────────────────────────────────────────────

  describe('expireStaleOrders()', () => {
    it('resolves without throwing when no stale orders exist', async () => {
      mockPaymentRepo.find.mockResolvedValueOnce([]);
      await expect(svc.expireStaleOrders()).resolves.not.toThrow();
    });

    it('does not expire a paid order (routes to checkOrder instead)', async () => {
      const payment = makePayment();
      mockPaymentRepo.find.mockResolvedValueOnce([payment]);

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'paid', attempts: 1, amount: 5000 }),
      } as any)
      // fetchOrderPayments for the capture path
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ items: [{ id: 'p1', status: 'captured', amount: 5000 }] }),
      } as any);

      await svc.expireStaleOrders();
      // Should not mark as failed when status is 'paid'
      const failCalls = mockQBUpdate.set.mock.calls.filter(([s]: any) => s?.status === PaymentStatus.FAILED);
      expect(failCalls).toHaveLength(0);
    });
  });
});
