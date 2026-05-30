import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CommissionRule } from './entities/commission-rule.entity';
import { TdsRecord } from './entities/tds-record.entity';
import { HolidaySurge } from './entities/holiday-surge.entity';
import { DiscountCode, DiscountType } from './entities/discount-code.entity';
import { TravelFeeRule } from './entities/travel-fee-rule.entity';

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date();

function makeRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id:            'rule-1',
    basePct:       20,
    surgePct:      0,
    surgeEnabled:  false,
    minFeePaise:   null as any,
    maxFeePaise:   null as any,
    religionSlug:  null as any,
    serviceId:     null as any,
    providerRole:  null as any,
    effectiveFrom: new Date(NOW.getTime() - 1000),
    effectiveTo:   null as any,
    isActive:      true,
    createdAt:     NOW,
    ...overrides,
  } as unknown as CommissionRule;
}

function makeTravelRule(
  minKm: number, maxKm: number, flat: number, perKm: number,
): TravelFeeRule {
  return { id: `tr-${minKm}`, minKm, maxKm, flatFeePaise: flat, perKmAbovePaise: perKm, isActive: true } as unknown as TravelFeeRule;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const updateQB = {
  update:  jest.fn().mockReturnThis(),
  set:     jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockRuleRepo = {
  find:               jest.fn().mockResolvedValue([makeRule()]),
  findOne:            jest.fn().mockResolvedValue(makeRule()),
  create:             jest.fn().mockImplementation((d: any) => d),
  save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  createQueryBuilder: jest.fn().mockReturnValue(updateQB),
};

const mockTdsRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => d),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
};

const mockSurgeRepo = {
  find:       jest.fn().mockResolvedValue([]),
  findOneOrFail: jest.fn(),
  create:     jest.fn().mockImplementation((d: any) => d),
  save:       jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  delete:     jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockDiscountRepo = {
  findOne:            jest.fn().mockResolvedValue(null),
  createQueryBuilder: jest.fn().mockReturnValue(updateQB),
};

const mockTravelRepo = {
  find:  jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  save:  jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  create:jest.fn().mockImplementation((d: any) => d),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PricingService', () => {
  let svc: PricingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRuleRepo.find.mockResolvedValue([makeRule()]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: getRepositoryToken(CommissionRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(TdsRecord),      useValue: mockTdsRepo },
        { provide: getRepositoryToken(HolidaySurge),   useValue: mockSurgeRepo },
        { provide: getRepositoryToken(DiscountCode),   useValue: mockDiscountRepo },
        { provide: getRepositoryToken(TravelFeeRule),  useValue: mockTravelRepo },
      ],
    }).compile();

    svc = module.get<PricingService>(PricingService);
  });

  // ── calculateFee ───────────────────────────────────────────────────────────

  describe('calculateFee()', () => {
    it('applies 20% commission from the active default rule', async () => {
      const result = await svc.calculateFee('svc-1', 100000, 'hindu');
      expect(result.platformFeePaise).toBe(20000);
      expect(result.providerAmountPaise).toBe(80000);
      expect(result.commissionPct).toBe(20);
    });

    it('falls back to 10% when no matching rule exists', async () => {
      mockRuleRepo.find.mockResolvedValueOnce([]);
      const result = await svc.calculateFee('svc-x', 10000, 'jain');
      expect(result.commissionPct).toBe(10);
      expect(result.platformFeePaise).toBe(1000);
    });

    it('respects minFeePaise floor', async () => {
      mockRuleRepo.find.mockResolvedValueOnce([makeRule({ basePct: 5, minFeePaise: 5000 })]);
      const result = await svc.calculateFee('svc-1', 10000, 'hindu'); // 5% = 500 < floor 5000
      expect(result.platformFeePaise).toBe(5000);
    });

    it('respects maxFeePaise ceiling', async () => {
      mockRuleRepo.find.mockResolvedValueOnce([makeRule({ basePct: 50, maxFeePaise: 3000 })]);
      const result = await svc.calculateFee('svc-1', 10000, 'hindu'); // 50% = 5000 > cap 3000
      expect(result.platformFeePaise).toBe(3000);
    });

    it('clamps fee so provider amount never goes negative', async () => {
      // pathological: 150% rule
      mockRuleRepo.find.mockResolvedValueOnce([makeRule({ basePct: 150, maxFeePaise: null as any })]);
      const result = await svc.calculateFee('svc-1', 1000, 'hindu');
      expect(result.providerAmountPaise).toBeGreaterThanOrEqual(0);
    });

    it('adds surgePct when surgeEnabled is true', async () => {
      mockRuleRepo.find.mockResolvedValueOnce([makeRule({ basePct: 15, surgeEnabled: true, surgePct: 5 })]);
      const result = await svc.calculateFee('svc-1', 10000, 'hindu');
      expect(result.commissionPct).toBe(20);
      expect(result.platformFeePaise).toBe(2000);
    });
  });

  // ── trackTds ───────────────────────────────────────────────────────────────

  describe('trackTds()', () => {
    const FY = '2025-26';

    it('creates a new TDS record if none exists', async () => {
      const rec = await svc.trackTds('prov-1', 1_000_000, FY);
      expect(mockTdsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'prov-1', financialYear: FY }),
      );
      expect(rec.totalEarningsPaise).toBe(1_000_000);
    });

    it('does NOT deduct TDS below the ₹30,000 threshold', async () => {
      const rec = await svc.trackTds('prov-1', 2_000_000, FY); // ₹20,000 < ₹30,000
      expect(rec.tdsDeductedPaise).toBe(0);
    });

    it('deducts 10% TDS on earnings above ₹30,000 threshold', async () => {
      const rec = await svc.trackTds('prov-1', 4_000_000, FY); // ₹40,000 total → ₹10,000 taxable
      // taxable = 4_000_000 - 3_000_000 = 1_000_000; 10% = 100_000
      expect(rec.tdsDeductedPaise).toBe(100_000);
    });

    it('accumulates earnings across calls (uses stored record)', async () => {
      const existing = {
        providerId: 'prov-1',
        financialYear: FY,
        totalEarningsPaise: 2_000_000,
        tdsDeductedPaise: 0,
        tdsThresholdPaise: 3_000_000,
        tdsPct: 10.0,
      };
      mockTdsRepo.findOne.mockResolvedValueOnce(existing);

      const rec = await svc.trackTds('prov-1', 2_000_000, FY); // 2M + 2M = 4M → 1M taxable
      expect(rec.totalEarningsPaise).toBe(4_000_000);
      expect(rec.tdsDeductedPaise).toBe(100_000);
    });
  });

  // ── computeTravelFee ───────────────────────────────────────────────────────

  describe('computeTravelFee()', () => {
    beforeEach(() => {
      mockTravelRepo.find.mockResolvedValue([
        makeTravelRule(0,  10, 10000, 0),     // ₹100 flat up to 10km
        makeTravelRule(10, 25, 10000, 1500),  // ₹100 + ₹15/km above 10
        makeTravelRule(25, 50, 32500, 2000),  // ₹325 + ₹20/km above 25
      ]);
    });

    it('returns 0 for zero distance', async () => {
      expect(await svc.computeTravelFee(0)).toBe(0);
    });

    it('returns flat fee for distance within first bracket', async () => {
      expect(await svc.computeTravelFee(5)).toBe(10000); // ₹100
    });

    it('computes per-km portion for second bracket (15km)', async () => {
      // flat 10000 + (15-10) * 1500 = 10000 + 7500 = 17500
      expect(await svc.computeTravelFee(15)).toBe(17500);
    });

    it('computes third bracket (30km)', async () => {
      // flat 32500 + (30-25) * 2000 = 32500 + 10000 = 42500
      expect(await svc.computeTravelFee(30)).toBe(42500);
    });
  });

  // ── validateConsultationRate ───────────────────────────────────────────────

  describe('validateConsultationRate()', () => {
    it('allows ₹10–₹20/min for <4 years experience', () => {
      expect(() => svc.validateConsultationRate(1500, 2)).not.toThrow();
    });

    it('throws for rate below min (₹10/min)', () => {
      expect(() => svc.validateConsultationRate(500, 2)).toThrow(BadRequestException);
    });

    it('allows up to ₹100/min for 10+ years experience', () => {
      expect(() => svc.validateConsultationRate(10000, 12)).not.toThrow();
    });

    it('throws for rate above max for experience level', () => {
      expect(() => svc.validateConsultationRate(3000, 2)).toThrow(BadRequestException); // max is 2000 for <4yr
    });
  });

  // ── getActiveSurge — capped at 1.5x ───────────────────────────────────────

  describe('getActiveSurge()', () => {
    it('returns multiplier 1.0 when no surge matches', async () => {
      const result = await svc.getActiveSurge('2025-01-15', 'hindu');
      expect(result).toEqual({ multiplier: 1.0, label: null });
    });

    it('returns active surge multiplier and label', async () => {
      mockSurgeRepo.find.mockResolvedValueOnce([{
        id: 's-1', name: 'Diwali', multiplier: 1.3,
        startDate: '2025-10-20', endDate: '2025-10-22',
        religionSlug: null, isActive: true,
      }]);
      const result = await svc.getActiveSurge('2025-10-21', 'hindu');
      expect(result).toEqual({ multiplier: 1.3, label: 'Diwali' });
    });

    it('hard-caps surge multiplier at 1.5x', async () => {
      mockSurgeRepo.find.mockResolvedValueOnce([{
        id: 's-1', name: 'BigFest', multiplier: 2.0, // would be capped
        startDate: '2025-10-20', endDate: '2025-10-22',
        religionSlug: null, isActive: true,
      }]);
      const result = await svc.getActiveSurge('2025-10-21', 'hindu');
      expect(result.multiplier).toBe(1.5);
    });
  });

  // ── applyDiscount ──────────────────────────────────────────────────────────

  describe('applyDiscount()', () => {
    function makeDiscount(overrides: any = {}): DiscountCode {
      return {
        id: 'dc-1', code: 'SAVE10', isActive: true,
        discountType: DiscountType.PERCENTAGE, value: 10,
        maxDiscountPaise: null as any, minOrderPaise: 0,
        maxUses: null as any, usesCount: 0,
        expiresAt: null as any, religionSlug: null as any,
        ...overrides,
      } as unknown as DiscountCode;
    }

    it('applies percentage discount correctly', async () => {
      mockDiscountRepo.findOne.mockResolvedValueOnce(makeDiscount());
      const discount = await svc.applyDiscount('SAVE10', 100000, 'hindu', 'user-1');
      expect(discount).toBe(10000); // 10% of ₹1000
    });

    it('throws BadRequestException for unknown code', async () => {
      await expect(
        svc.applyDiscount('FAKECODE', 100000, 'hindu', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when code is expired', async () => {
      mockDiscountRepo.findOne.mockResolvedValueOnce(
        makeDiscount({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        svc.applyDiscount('SAVE10', 100000, 'hindu', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when max uses exceeded', async () => {
      mockDiscountRepo.findOne.mockResolvedValueOnce(
        makeDiscount({ maxUses: 100, usesCount: 100 }),
      );
      await expect(
        svc.applyDiscount('SAVE10', 100000, 'hindu', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('respects maxDiscountPaise cap on percentage discount', async () => {
      mockDiscountRepo.findOne.mockResolvedValueOnce(
        makeDiscount({ value: 50, maxDiscountPaise: 5000 }),
      );
      const discount = await svc.applyDiscount('SAVE50', 100000, 'hindu', 'user-1');
      expect(discount).toBe(5000); // capped at ₹50
    });

    it('throws when order total is below minimum', async () => {
      mockDiscountRepo.findOne.mockResolvedValueOnce(
        makeDiscount({ minOrderPaise: 50000 }),
      );
      await expect(
        svc.applyDiscount('SAVE10', 10000, 'hindu', 'user-1'), // ₹100 < ₹500 min
      ).rejects.toThrow(BadRequestException);
    });
  });
});
