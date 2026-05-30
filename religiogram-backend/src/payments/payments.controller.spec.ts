import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPaymentsService = {
  createOrder:    jest.fn().mockResolvedValue({ razorpayOrderId: 'order_1', amountPaise: 5000 }),
  verifyPayment:  jest.fn().mockResolvedValue({ success: true }),
  handleWebhook:  jest.fn().mockResolvedValue(undefined),
  refundPayment:  jest.fn().mockResolvedValue({ refunded: true }),
};

const fakeUser = { id: 'user-1', role: 'seeker' };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PaymentsController', () => {
  let ctrl: PaymentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    ctrl = module.get<PaymentsController>(PaymentsController);
  });

  // ── createOrder ────────────────────────────────────────────────────────────

  describe('createOrder()', () => {
    it('delegates to paymentsService.createOrder with dto and userId', async () => {
      const dto = { bookingId: 'booking-1' };
      const result = await ctrl.createOrder(dto as any, fakeUser as any);
      expect(mockPaymentsService.createOrder).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.razorpayOrderId).toBe('order_1');
    });
  });

  // ── verifyPayment ──────────────────────────────────────────────────────────

  describe('verifyPayment()', () => {
    it('delegates to paymentsService.verifyPayment with dto and userId', async () => {
      const dto = { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' };
      const result = await ctrl.verifyPayment(dto as any, fakeUser as any);
      expect(mockPaymentsService.verifyPayment).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.success).toBe(true);
    });
  });

  // ── handleWebhook ──────────────────────────────────────────────────────────

  describe('handleWebhook()', () => {
    it('calls paymentsService.handleWebhook with rawBody and signature', async () => {
      const rawBody = Buffer.from('{"event":"payment.captured"}');
      const req: any = { rawBody };
      const result = await ctrl.handleWebhook(req, 'valid-sig');
      expect(mockPaymentsService.handleWebhook).toHaveBeenCalledWith(rawBody, 'valid-sig');
      expect(result).toEqual({ received: true });
    });

    it('throws InternalServerErrorException when rawBody is missing', async () => {
      const req: any = { rawBody: undefined };
      await expect(ctrl.handleWebhook(req, 'sig')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockPaymentsService.handleWebhook).not.toHaveBeenCalled();
    });
  });

  // ── refundPayment ──────────────────────────────────────────────────────────

  describe('refundPayment()', () => {
    it('delegates to paymentsService.refundPayment with bookingId', async () => {
      const result = await ctrl.refundPayment('booking-uuid-1');
      expect(mockPaymentsService.refundPayment).toHaveBeenCalledWith('booking-uuid-1');
      expect(result).toEqual({ refunded: true });
    });
  });
});
