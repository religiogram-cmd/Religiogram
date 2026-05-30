import { Test, TestingModule } from '@nestjs/testing';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPricingService = {
  getActiveRules:        jest.fn().mockResolvedValue([]),
  createRule:            jest.fn().mockResolvedValue({ id: 'rule-1' }),
  updateRule:            jest.fn().mockResolvedValue({ id: 'rule-1' }),
  computeBookingPrice:   jest.fn().mockResolvedValue({ totalPaise: 10_000, breakdown: {} }),
  listHolidaySurges:     jest.fn().mockResolvedValue([]),
  createHolidaySurge:    jest.fn().mockResolvedValue({ id: 'surge-1' }),
  updateHolidaySurge:    jest.fn().mockResolvedValue({ id: 'surge-1' }),
  deleteHolidaySurge:    jest.fn().mockResolvedValue(undefined),
  listTravelFeeRules:    jest.fn().mockResolvedValue([]),
  createTravelFeeRule:   jest.fn().mockResolvedValue({ id: 'travel-1' }),
  listDiscountCodes:     jest.fn().mockResolvedValue([]),
  createDiscountCode:    jest.fn().mockResolvedValue({ id: 'disc-1' }),
  deactivateDiscountCode: jest.fn().mockResolvedValue({ id: 'disc-1', active: false }),
  applyDiscount:         jest.fn().mockResolvedValue(500),
};

const RULE_UUID  = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const SURGE_UUID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const DISC_UUID  = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PricingController', () => {
  let ctrl: PricingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [{ provide: PricingService, useValue: mockPricingService }],
    }).compile();

    ctrl = module.get<PricingController>(PricingController);
  });

  // ── Commission rules ───────────────────────────────────────────────────────

  describe('getRules()', () => {
    it('delegates to pricingService.getActiveRules', async () => {
      await ctrl.getRules();
      expect(mockPricingService.getActiveRules).toHaveBeenCalled();
    });
  });

  describe('createRule()', () => {
    it('delegates to pricingService.createRule with dto', async () => {
      const dto: any = { religionSlug: 'hinduism', commissionPct: 15 };
      await ctrl.createRule(dto);
      expect(mockPricingService.createRule).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateRule()', () => {
    it('delegates to pricingService.updateRule with id and dto', async () => {
      const dto: any = { commissionPct: 20 };
      await ctrl.updateRule(RULE_UUID, dto);
      expect(mockPricingService.updateRule).toHaveBeenCalledWith(RULE_UUID, dto);
    });
  });

  // ── Booking price computation ──────────────────────────────────────────────

  describe('computePrice()', () => {
    it('delegates to pricingService.computeBookingPrice with mapped fields', async () => {
      const dto: any = {
        serviceId: 'svc-1',
        basePricePaise: 5_000,
        religionSlug: 'hinduism',
        providerRole: 'pandit',
        serviceDate: '2025-06-01',
        distanceKm: 10,
        addOnsTotalPaise: 500,
        discountCode: 'SAVE10',
      };
      await ctrl.computePrice(dto, 'user-1');
      expect(mockPricingService.computeBookingPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'svc-1',
          basePricePaise: 5_000,
          distanceKm: 10,
          addOnsTotalPaise: 500,
          discountCode: 'SAVE10',
          userId: 'user-1',
        }),
      );
    });

    it('defaults distanceKm and addOnsTotalPaise to 0 when absent', async () => {
      const dto: any = {
        serviceId: 's1', basePricePaise: 1000, religionSlug: 'hinduism',
        providerRole: 'pandit', serviceDate: '2025-01-01',
      };
      await ctrl.computePrice(dto, undefined);
      const arg = mockPricingService.computeBookingPrice.mock.calls[0][0];
      expect(arg.distanceKm).toBe(0);
      expect(arg.addOnsTotalPaise).toBe(0);
    });
  });

  // ── Holiday surges ─────────────────────────────────────────────────────────

  describe('listSurges()', () => {
    it('delegates to pricingService.listHolidaySurges', async () => {
      await ctrl.listSurges();
      expect(mockPricingService.listHolidaySurges).toHaveBeenCalled();
    });
  });

  describe('createSurge()', () => {
    it('delegates with dto', async () => {
      const dto: any = { date: '2025-12-25', multiplier: 1.5, label: 'Christmas' };
      await ctrl.createSurge(dto);
      expect(mockPricingService.createHolidaySurge).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateSurge()', () => {
    it('delegates with id and partial dto', async () => {
      await ctrl.updateSurge(SURGE_UUID, { multiplier: 2.0 } as any);
      expect(mockPricingService.updateHolidaySurge).toHaveBeenCalledWith(
        SURGE_UUID, { multiplier: 2.0 },
      );
    });
  });

  describe('deleteSurge()', () => {
    it('delegates to pricingService.deleteHolidaySurge with id', async () => {
      await ctrl.deleteSurge(SURGE_UUID);
      expect(mockPricingService.deleteHolidaySurge).toHaveBeenCalledWith(SURGE_UUID);
    });
  });

  // ── Travel fees ────────────────────────────────────────────────────────────

  describe('listTravelFees()', () => {
    it('delegates to pricingService.listTravelFeeRules', async () => {
      await ctrl.listTravelFees();
      expect(mockPricingService.listTravelFeeRules).toHaveBeenCalled();
    });
  });

  describe('createTravelFee()', () => {
    it('delegates with dto', async () => {
      const dto: any = { minKm: 0, maxKm: 10, feePaise: 500 };
      await ctrl.createTravelFee(dto);
      expect(mockPricingService.createTravelFeeRule).toHaveBeenCalledWith(dto);
    });
  });

  // ── Discount codes ─────────────────────────────────────────────────────────

  describe('listDiscounts()', () => {
    it('delegates to pricingService.listDiscountCodes', async () => {
      await ctrl.listDiscounts();
      expect(mockPricingService.listDiscountCodes).toHaveBeenCalled();
    });
  });

  describe('createDiscount()', () => {
    it('delegates with dto', async () => {
      const dto: any = { code: 'SAVE10', discountPct: 10 };
      await ctrl.createDiscount(dto);
      expect(mockPricingService.createDiscountCode).toHaveBeenCalledWith(dto);
    });
  });

  describe('deactivateDiscount()', () => {
    it('delegates to pricingService.deactivateDiscountCode with id', async () => {
      await ctrl.deactivateDiscount(DISC_UUID);
      expect(mockPricingService.deactivateDiscountCode).toHaveBeenCalledWith(DISC_UUID);
    });
  });

  describe('validateDiscount()', () => {
    it('delegates to pricingService.applyDiscount and wraps result', async () => {
      mockPricingService.applyDiscount.mockResolvedValueOnce(1000);
      const dto: any = { code: 'SAVE10', orderTotalPaise: 10_000, religionSlug: 'hinduism' };
      const result = await ctrl.validateDiscount(dto, 'user-1');
      expect(mockPricingService.applyDiscount).toHaveBeenCalledWith(
        'SAVE10', 10_000, 'hinduism', 'user-1',
      );
      expect(result.valid).toBe(true);
      expect(result.discountPaise).toBe(1000);
    });

    it('defaults userId to "anon" when not provided', async () => {
      const dto: any = { code: 'TEST', orderTotalPaise: 500, religionSlug: 'hinduism' };
      await ctrl.validateDiscount(dto);
      const [,,, userId] = mockPricingService.applyDiscount.mock.calls[0];
      expect(userId).toBe('anon');
    });
  });
});
