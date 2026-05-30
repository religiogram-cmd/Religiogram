import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockWalletService = {
  getBalance:      jest.fn().mockResolvedValue({ balancePaise: 10_000 }),
  credit:          jest.fn().mockResolvedValue({ balancePaise: 15_000 }),
  getTransactions: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
};

const mockPaymentsService = {
  createTopUpOrder: jest.fn().mockResolvedValue({ razorpayOrderId: 'order_wallet_1', amountPaise: 50_000 }),
  findByPaymentId:  jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

function fakeReq(userId = 'user-1'): any {
  return { user: { sub: userId } };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('WalletController', () => {
  let ctrl: WalletController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService,    useValue: mockWalletService },
        { provide: PaymentsService,  useValue: mockPaymentsService },
        { provide: ConfigService,    useValue: mockConfig },
      ],
    }).compile();

    ctrl = module.get<WalletController>(WalletController);
  });

  // ── getBalance ─────────────────────────────────────────────────────────────

  describe('getBalance()', () => {
    it('delegates to walletService.getBalance with userId from req.user.sub', async () => {
      const result = await ctrl.getBalance(fakeReq());
      expect(mockWalletService.getBalance).toHaveBeenCalledWith('user-1');
      expect(result.balancePaise).toBe(10_000);
    });
  });

  // ── createTopUpOrder ───────────────────────────────────────────────────────

  describe('createTopUpOrder()', () => {
    it('delegates to paymentsService.createTopUpOrder with userId and amountPaise', async () => {
      const result = await ctrl.createTopUpOrder(fakeReq(), { amountPaise: 50_000 } as any);
      expect(mockPaymentsService.createTopUpOrder).toHaveBeenCalledWith('user-1', 50_000);
      expect(result.razorpayOrderId).toBe('order_wallet_1');
    });
  });

  // ── recharge ───────────────────────────────────────────────────────────────

  describe('recharge()', () => {
    const dto = { paymentId: 'pay_captured_1', amount: 500 }; // 500 INR = 50000 paise

    it('credits wallet when payment is captured and amount matches', async () => {
      mockPaymentsService.findByPaymentId.mockResolvedValueOnce({
        userId: 'user-1',
        status: PaymentStatus.CAPTURED,
        amountPaise: 50_000,
      });

      const result = await ctrl.recharge(fakeReq(), dto as any);
      expect(mockWalletService.credit).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          amount: 50_000,
          referenceId: 'pay_captured_1',
          idempotencyKey: 'recharge-pay_captured_1',
        }),
      );
      expect(result.balancePaise).toBe(15_000);
    });

    it('throws BadRequestException when payment id is unknown', async () => {
      mockPaymentsService.findByPaymentId.mockResolvedValueOnce(null);
      await expect(ctrl.recharge(fakeReq(), dto as any)).rejects.toThrow(BadRequestException);
      expect(mockWalletService.credit).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when payment belongs to a different user', async () => {
      mockPaymentsService.findByPaymentId.mockResolvedValueOnce({
        userId: 'other-user',
        status: PaymentStatus.CAPTURED,
        amountPaise: 50_000,
      });
      await expect(ctrl.recharge(fakeReq('user-1'), dto as any)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when payment is not captured', async () => {
      mockPaymentsService.findByPaymentId.mockResolvedValueOnce({
        userId: 'user-1',
        status: PaymentStatus.CREATED,
        amountPaise: 50_000,
      });
      await expect(ctrl.recharge(fakeReq(), dto as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when amount does not match payment', async () => {
      mockPaymentsService.findByPaymentId.mockResolvedValueOnce({
        userId: 'user-1',
        status: PaymentStatus.CAPTURED,
        amountPaise: 99_000, // different amount
      });
      await expect(ctrl.recharge(fakeReq(), dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ── transactions ───────────────────────────────────────────────────────────

  describe('transactions()', () => {
    it('delegates to walletService.getTransactions with userId, cursor, limit', async () => {
      const result = await ctrl.transactions(fakeReq(), 'cursor-xyz', '10');
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith('user-1', 'cursor-xyz', 10);
      expect(result).toHaveProperty('data');
    });

    it('defaults limit to 20 when not provided', async () => {
      await ctrl.transactions(fakeReq(), undefined, '20');
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith('user-1', undefined, 20);
    });
  });
});
