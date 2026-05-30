import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

// ── Mock axios ────────────────────────────────────────────────────────────────
jest.mock('axios');
import axios from 'axios';
const mockAxiosPost = jest.spyOn(axios, 'post');
const mockAxiosGet  = jest.spyOn(axios, 'get');

import { PlaceDonationsService } from './place-donations.service';
import { PlaceDonation, DonationStatus } from './entities/place-donation.entity';
import { Temple } from '../temples/entities/temple.entity';
import { createHmac } from 'crypto';

// ── helpers ───────────────────────────────────────────────────────────────────

const KEY_SECRET = 'rzp_test_secret';

function hmac(data: string) {
  return createHmac('sha256', KEY_SECRET).update(data).digest('hex');
}

function makeDonation(overrides: any = {}): PlaceDonation {
  return {
    id:              'don-1',
    placeId:         'place-1',
    userId:          'user-1',
    amountPaise:     5000,
    currency:        'INR',
    status:          'created' as DonationStatus,
    razorpayOrderId: 'order_test_1',
    razorpayPaymentId: null,
    message:         null,
    isAnonymous:     false,
    idempotencyKey:  'key-abc',
    createdAt:       new Date(),
    ...overrides,
  } as unknown as PlaceDonation;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDonationRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find:    jest.fn().mockResolvedValue([]),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeDonation(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeDonation(), ...d })),
};

const mockTempleRepo = {
  findOne: jest.fn().mockResolvedValue({ id: 'place-1', name: 'Kashi Vishwanath' }),
};

const mockConfig = {
  get:        jest.fn((key: string, def?: any) => {
    if (key === 'razorpay.keyId')     return 'rzp_test_key';
    if (key === 'razorpay.keySecret') return KEY_SECRET;
    return def ?? null;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'razorpay.keyId')     return 'rzp_test_key';
    if (key === 'razorpay.keySecret') return KEY_SECRET;
    throw new Error(`Missing ${key}`);
  }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlaceDonationsService', () => {
  let svc: PlaceDonationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDonationRepo.findOne.mockResolvedValue(null);
    mockTempleRepo.findOne.mockResolvedValue({ id: 'place-1', name: 'Kashi Vishwanath' });
    mockAxiosPost.mockResolvedValue({ data: { id: 'order_new_1', amount: 5000, currency: 'INR', status: 'created' } } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceDonationsService,
        { provide: getRepositoryToken(PlaceDonation), useValue: mockDonationRepo },
        { provide: getRepositoryToken(Temple),        useValue: mockTempleRepo },
        { provide: ConfigService,                     useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<PlaceDonationsService>(PlaceDonationsService);
  });

  // ── createOrder ────────────────────────────────────────────────────────────

  describe('createOrder()', () => {
    it('throws BadRequestException when amount is below minimum (100 paise)', async () => {
      await expect(svc.createOrder('place-1', 'user-1', { amountPaise: 99 })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when amount exceeds maximum', async () => {
      await expect(svc.createOrder('place-1', 'user-1', { amountPaise: 10_000_001 })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when place does not exist', async () => {
      mockTempleRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.createOrder('bad-place', 'user-1', { amountPaise: 1000 })).rejects.toThrow(NotFoundException);
    });

    it('creates Razorpay order and saves donation record', async () => {
      const result = await svc.createOrder('place-1', 'user-1', { amountPaise: 5000 });
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('/orders'),
        expect.objectContaining({ amount: 5000, currency: 'INR' }),
        expect.any(Object),
      );
      expect(mockDonationRepo.save).toHaveBeenCalled();
      expect(result.razorpayOrderId).toBe('order_new_1');
    });

    it('returns existing order idempotently when same userId+placeId+amount used again', async () => {
      mockDonationRepo.findOne.mockResolvedValueOnce(makeDonation({ razorpayOrderId: 'order_existing' }));
      const result = await svc.createOrder('place-1', 'user-1', { amountPaise: 5000 });
      expect(result.razorpayOrderId).toBe('order_existing');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when Razorpay API fails', async () => {
      mockAxiosPost.mockRejectedValueOnce({ message: 'Network error', response: { data: {} } });
      await expect(svc.createOrder('place-1', 'user-1', { amountPaise: 1000 })).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── verifyPayment ──────────────────────────────────────────────────────────

  describe('verifyPayment()', () => {
    it('throws NotFoundException when donation is not found', async () => {
      mockDonationRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.verifyPayment('user-1', {
        donationId: 'bad-id',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      })).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when donation belongs to another user', async () => {
      mockDonationRepo.findOne.mockResolvedValueOnce(makeDonation({ userId: 'other-user' }));
      await expect(svc.verifyPayment('user-1', {
        donationId: 'don-1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig',
      })).rejects.toThrow(UnauthorizedException);
    });

    it('verifies HMAC signature and marks donation as captured', async () => {
      const donation = makeDonation({ razorpayOrderId: 'order_test_1' });
      mockDonationRepo.findOne.mockResolvedValueOnce(donation);

      // Build a valid signature: HMAC(orderId|paymentId)
      const paymentId = 'pay_captured_1';
      const validSig  = hmac(`order_test_1|${paymentId}`);

      const result = await svc.verifyPayment('user-1', {
        donationId:        'don-1',
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      });

      expect(result.success).toBe(true);
      expect(mockDonationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'captured' }),
      );
    });

    it('rejects invalid signature and does not mark as captured', async () => {
      const donation = makeDonation({ razorpayOrderId: 'order_test_1' });
      mockDonationRepo.findOne.mockResolvedValueOnce(donation);

      await expect(svc.verifyPayment('user-1', {
        donationId:        'don-1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'invalid-signature',
      })).rejects.toThrow();

      expect(mockDonationRepo.save).not.toHaveBeenCalled();
    });
  });
});
