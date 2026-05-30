import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';

import { PaymentsService, PAYMENT_WEBHOOK_QUEUE } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { RedisService } from '../redis/redis.service';

// ── helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret';
const KEY_SECRET     = 'test-key-secret';
const KEY_ID         = 'rzp_test_keyid';

function sign(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function makePayload(event: string, orderId: string, paymentId: string, amount = 10000) {
  return {
    event,
    id: `evt_${Date.now()}`,
    payload: {
      payment: {
        entity: {
          id:               paymentId,
          order_id:         orderId,
          amount,
          error_description: event === 'payment.failed' ? 'Card declined' : undefined,
        },
      },
    },
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const bookingStub: Partial<Booking> = {
  id:          'book-1',
  userId:      'user-1',
  amountPaise: 10000,
  currency:    'INR',
  status:      BookingStatus.PENDING,
};

const paymentStub: Partial<Payment> = {
  id:               'pay-1',
  bookingId:        'book-1',
  userId:           'user-1',
  amountPaise:      10000,
  currency:         'INR',
  razorpayOrderId:  'order_abc',
  razorpayPaymentId: null as any,
  status:           PaymentStatus.CREATED,
  idempotencyKey:   'book-1',
};

const mockPaymentRepo = {
  findOne:       jest.fn(),
  find:          jest.fn().mockResolvedValue([]),
  create:        jest.fn().mockImplementation((d: any) => ({ ...paymentStub, ...d })),
  save:          jest.fn().mockImplementation((e: any) => Promise.resolve(e)),
  update:        jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue({
    update:  jest.fn().mockReturnThis(),
    set:     jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  }),
};

const mockBookingRepo = {
  findOne: jest.fn().mockResolvedValue(bookingStub),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: any) =>
    cb({
      getRepository: () => ({
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where:   jest.fn().mockReturnThis(),
          getOne:  jest.fn().mockResolvedValue({ ...paymentStub, razorpayPaymentId: 'pay_xyz' }),
        }),
        findOneOrFail: jest.fn().mockResolvedValue(paymentStub),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    }),
  ),
};

const mockBookingsService = {
  confirmBooking: jest.fn().mockResolvedValue(undefined),
  markRefunded:   jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'razorpay.keyId':        KEY_ID,
      'razorpay.keySecret':    KEY_SECRET,
      'razorpay.webhookSecret':WEBHOOK_SECRET,
    };
    return map[key] ?? '';
  }),
};

const mockRedis = {
  setIfNotExists: jest.fn().mockResolvedValue(true),
};

const mockWebhookQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ── test suite ────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let svc: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepo },
        { provide: getDataSourceToken(),         useValue: mockDataSource },
        { provide: BookingsService,              useValue: mockBookingsService },
        { provide: ConfigService,                useValue: mockConfig },
        { provide: RedisService,                 useValue: mockRedis },
        { provide: getQueueToken(PAYMENT_WEBHOOK_QUEUE), useValue: mockWebhookQueue },
      ],
    }).compile();

    svc = module.get<PaymentsService>(PaymentsService);
  });

  // ── handleWebhook ──────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    it('accepts a valid webhook signature and enqueues the job', async () => {
      const body = JSON.stringify({ event: 'payment.captured', id: 'evt_1' });
      const sig  = sign(body);

      await svc.handleWebhook(Buffer.from(body), sig);

      expect(mockWebhookQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({ event: 'payment.captured' }),
        expect.objectContaining({ jobId: 'webhook:evt_1' }),
      );
    });

    it('throws UnauthorizedException on invalid signature', async () => {
      const body = JSON.stringify({ event: 'payment.captured', id: 'evt_1' });
      await expect(svc.handleWebhook(Buffer.from(body), 'bad-sig')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockWebhookQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── processWebhookEvent — idempotency ─────────────────────────────────────

  describe('processWebhookEvent()', () => {
    it('skips duplicate event (Redis lock already held)', async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(false); // already processed
      await svc.processWebhookEvent('payment.captured', {}, 'evt_dup');
      expect(mockPaymentRepo.findOne).not.toHaveBeenCalled();
    });

    it('processes payment.captured and calls confirmBooking', async () => {
      mockPaymentRepo.findOne.mockResolvedValueOnce(paymentStub);
      const body = makePayload('payment.captured', 'order_abc', 'pay_xyz', 10000);
      await svc.processWebhookEvent('payment.captured', body, 'evt_ok');
      expect(mockBookingsService.confirmBooking).toHaveBeenCalledWith('book-1', 'pay-1');
    });

    it('marks payment FAILED on payment.failed event', async () => {
      mockPaymentRepo.findOne.mockResolvedValueOnce(paymentStub);
      const body = makePayload('payment.failed', 'order_abc', 'pay_xyz');
      await svc.processWebhookEvent('payment.failed', body, 'evt_fail');
      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        { id: 'pay-1' },
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });

    it('handles refund.processed and marks booking refunded when fully refunded', async () => {
      const capturedPayment = {
        ...paymentStub,
        status:           PaymentStatus.CAPTURED,
        razorpayPaymentId:'pay_xyz',
        amountPaise:      10000,
        refundedAmountPaise: 0,
      };
      mockPaymentRepo.findOne.mockResolvedValueOnce(capturedPayment);

      const refundPayload = {
        payload: {
          refund: {
            entity: { id: 'rfnd_1', payment_id: 'pay_xyz', amount: 10000 },
          },
        },
      };
      await svc.processWebhookEvent('refund.processed', refundPayload, 'evt_refund');

      expect(mockPaymentRepo.update).toHaveBeenCalledWith(
        { id: 'pay-1' },
        expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      );
      expect(mockBookingsService.markRefunded).toHaveBeenCalledWith('book-1');
    });

    it('does not mark booking refunded on partial refund', async () => {
      const capturedPayment = {
        ...paymentStub,
        status:           PaymentStatus.CAPTURED,
        razorpayPaymentId:'pay_xyz',
        amountPaise:      10000,
        refundedAmountPaise: 0,
      };
      mockPaymentRepo.findOne.mockResolvedValueOnce(capturedPayment);

      const refundPayload = {
        payload: {
          refund: {
            entity: { id: 'rfnd_1', payment_id: 'pay_xyz', amount: 5000 }, // partial
          },
        },
      };
      await svc.processWebhookEvent('refund.processed', refundPayload, 'evt_partial');

      expect(mockBookingsService.markRefunded).not.toHaveBeenCalled();
    });

    it('ignores unknown events gracefully', async () => {
      await expect(
        svc.processWebhookEvent('subscription.created', {}, 'evt_unknown'),
      ).resolves.not.toThrow();
      expect(mockPaymentRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ── verifyPayment ─────────────────────────────────────────────────────────

  describe('verifyPayment()', () => {
    it('throws UnauthorizedException on invalid signature', async () => {
      await expect(
        svc.verifyPayment(
          { razorpayOrderId: 'order_abc', razorpayPaymentId: 'pay_xyz', razorpaySignature: 'bad', bookingId: 'book-1' },
          'user-1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('confirms booking on valid signature', async () => {
      const orderId   = 'order_abc';
      const paymentId = 'pay_xyz';
      const validSig  = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPaymentRepo.findOne.mockResolvedValueOnce({ ...paymentStub, razorpayOrderId: orderId });

      await svc.verifyPayment(
        { razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: validSig, bookingId: 'book-1' },
        'user-1',
      );

      expect(mockBookingsService.confirmBooking).toHaveBeenCalledWith('book-1', 'pay-1');
    });

    it('is idempotent — returns early if already CAPTURED', async () => {
      const orderId   = 'order_abc';
      const paymentId = 'pay_xyz';
      const validSig  = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      mockPaymentRepo.findOne.mockResolvedValueOnce({
        ...paymentStub,
        razorpayOrderId: orderId,
        status: PaymentStatus.CAPTURED,
      });

      await svc.verifyPayment(
        { razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: validSig, bookingId: 'book-1' },
        'user-1',
      );

      expect(mockBookingsService.confirmBooking).not.toHaveBeenCalled();
    });
  });
});
