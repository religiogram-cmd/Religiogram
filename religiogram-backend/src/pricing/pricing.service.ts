import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { CommissionRule } from './entities/commission-rule.entity';
import { TdsRecord } from './entities/tds-record.entity';
import { HolidaySurge } from './entities/holiday-surge.entity';
import { DiscountCode, DiscountType } from './entities/discount-code.entity';
import { TravelFeeRule } from './entities/travel-fee-rule.entity';
import {
  CreateCommissionRuleDto, UpdateCommissionRuleDto,
  CreateHolidaySurgeDto, CreateDiscountCodeDto, CreateTravelFeeRuleDto,
} from './dto/pricing.dto';

export interface FeeCalculation {
  platformFeePaise: number;
  providerAmountPaise: number;
  commissionPct: number;
  surgeMultiplier: number;
}

export interface BookingPriceResult {
  basePricePaise: number;
  surgeMultiplier: number;
  surgeLabel: string | null;
  travelFeePaise: number;
  addOnsTotalPaise: number;
  discountPaise: number;
  subtotalPaise: number;
  platformFeePaise: number;
  providerAmountPaise: number;
  totalPaise: number;
  commissionPct: number;
}

export interface ConsultationRateBounds {
  minPaise: number;
  maxPaise: number;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(CommissionRule)
    private readonly ruleRepo: Repository<CommissionRule>,
    @InjectRepository(TdsRecord)
    private readonly tdsRepo: Repository<TdsRecord>,
    @InjectRepository(HolidaySurge)
    private readonly surgeRepo: Repository<HolidaySurge>,
    @InjectRepository(DiscountCode)
    private readonly discountRepo: Repository<DiscountCode>,
    @InjectRepository(TravelFeeRule)
    private readonly travelRepo: Repository<TravelFeeRule>,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Commission calculation
  // ────────────────────────────────────────────────────────────────────────────

  async calculateFee(
    serviceId: string,
    amount: number,
    religionSlug: string,
    providerRole?: string,
  ): Promise<FeeCalculation> {
    const now = new Date();

    const allRules = await this.ruleRepo.find({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC' },
    });

    const active = allRules.filter(
      (r) => r.effectiveFrom <= now && (r.effectiveTo === null || r.effectiveTo >= now),
    );

    const rule =
      active.find(
        (r) =>
          r.serviceId === serviceId &&
          (r.religionSlug === null || r.religionSlug === religionSlug) &&
          (r.providerRole === null || r.providerRole === providerRole),
      ) ??
      active.find(
        (r) =>
          r.serviceId === null &&
          r.religionSlug === religionSlug &&
          (r.providerRole === null || r.providerRole === providerRole),
      ) ??
      active.find((r) => r.serviceId === null && r.religionSlug === null);

    const pct = rule
      ? Number(rule.basePct) + (rule.surgeEnabled ? Number(rule.surgePct) : 0)
      : 10;
    let feePaise = Math.round((amount * pct) / 100);
    if (rule?.minFeePaise != null) feePaise = Math.max(feePaise, rule.minFeePaise);
    if (rule?.maxFeePaise != null) feePaise = Math.min(feePaise, rule.maxFeePaise);

    // Clamp the fee so the provider can never go negative.
    if (feePaise > amount) feePaise = Math.max(0, amount - 1);

    return {
      platformFeePaise: feePaise,
      providerAmountPaise: Math.max(0, amount - feePaise),
      commissionPct: pct,
      surgeMultiplier: 1.0,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Full booking price computation (Section 12.2)
  // ────────────────────────────────────────────────────────────────────────────

  async computeBookingPrice(opts: {
    serviceId: string;
    basePricePaise: number;
    religionSlug: string;
    providerRole?: string;
    serviceDate: string;       // YYYY-MM-DD
    distanceKm?: number;       // km from provider to booking address
    addOnsTotalPaise?: number;
    discountCode?: string;
    userId?: string;
  }): Promise<BookingPriceResult> {
    const {
      serviceId, basePricePaise, religionSlug, providerRole,
      serviceDate, distanceKm = 0, addOnsTotalPaise = 0, discountCode, userId,
    } = opts;

    // 1. Holiday surge check
    const { multiplier: surgeMultiplier, label: surgeLabel } =
      await this.getActiveSurge(serviceDate, religionSlug);

    const surgedBase = Math.round(basePricePaise * surgeMultiplier);

    // 2. Travel fee
    const travelFeePaise = await this.computeTravelFee(distanceKm);

    // 3. Subtotal before discount
    const preDiscountTotal = surgedBase + travelFeePaise + addOnsTotalPaise;

    // 4. Discount
    let discountPaise = 0;
    if (discountCode && userId) {
      discountPaise = await this.applyDiscount(
        discountCode, preDiscountTotal, religionSlug, userId,
      );
    }

    let subtotalPaise = preDiscountTotal - discountPaise;
    if (subtotalPaise < 0) subtotalPaise = 0;

    // Commission on the post-discount subtotal so the platform shares the
    // discount cost and the provider can never go negative.
    const feeCalc = await this.calculateFee(serviceId, subtotalPaise, religionSlug, providerRole);
    const providerAmount = Math.max(0, subtotalPaise - feeCalc.platformFeePaise);

    return {
      basePricePaise,
      surgeMultiplier,
      surgeLabel,
      travelFeePaise,
      addOnsTotalPaise,
      discountPaise,
      subtotalPaise,
      platformFeePaise: feeCalc.platformFeePaise,
      providerAmountPaise: providerAmount,
      totalPaise: subtotalPaise,
      commissionPct: feeCalc.commissionPct,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Holiday Surge
  // ────────────────────────────────────────────────────────────────────────────

  async getActiveSurge(
    dateStr: string,
    religionSlug: string,
  ): Promise<{ multiplier: number; label: string | null }> {
    const surges = await this.surgeRepo.find({ where: { isActive: true } });
    const match = surges.find(
      (s) =>
        dateStr >= s.startDate &&
        dateStr <= s.endDate &&
        (s.religionSlug === null || s.religionSlug === religionSlug),
    );
    if (!match) return { multiplier: 1.0, label: null };
    const m = Math.min(Number(match.multiplier), 1.5); // hard cap at 1.5x
    return { multiplier: m, label: match.name };
  }

  async createHolidaySurge(dto: CreateHolidaySurgeDto): Promise<HolidaySurge> {
    if (Number(dto.multiplier) > 1.5) {
      throw new BadRequestException('Surge multiplier cannot exceed 1.5');
    }
    const entity = this.surgeRepo.create(dto as Partial<HolidaySurge>);
    return this.surgeRepo.save(entity);
  }

  async listHolidaySurges(): Promise<HolidaySurge[]> {
    return this.surgeRepo.find({ order: { startDate: 'ASC' } });
  }

  async updateHolidaySurge(id: string, dto: Partial<CreateHolidaySurgeDto>): Promise<HolidaySurge> {
    const entity = await this.surgeRepo.findOneOrFail({ where: { id } });
    if (dto.multiplier && Number(dto.multiplier) > 1.5) {
      throw new BadRequestException('Surge multiplier cannot exceed 1.5');
    }
    Object.assign(entity, dto);
    return this.surgeRepo.save(entity);
  }

  async deleteHolidaySurge(id: string): Promise<void> {
    await this.surgeRepo.delete(id);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Travel Fee
  // ────────────────────────────────────────────────────────────────────────────

  async computeTravelFee(distanceKm: number): Promise<number> {
    if (distanceKm <= 0) return 0;
    const rules = await this.travelRepo.find({
      where: { isActive: true },
      order: { maxKm: 'ASC' },
    });
    for (const rule of rules) {
      if (distanceKm <= rule.maxKm) {
        const extraKm = Math.max(0, distanceKm - rule.minKm);
        return rule.flatFeePaise + Math.round(extraKm * rule.perKmAbovePaise);
      }
    }
    // Beyond all brackets: use last rule's per-km rate
    const last = rules[rules.length - 1];
    if (!last) return 0;
    const extraKm = distanceKm - last.minKm;
    return last.flatFeePaise + Math.round(extraKm * last.perKmAbovePaise);
  }

  async upsertDefaultTravelFeeRules(): Promise<void> {
    const count = await this.travelRepo.count();
    if (count > 0) return;
    await this.travelRepo.save([
      { minKm: 0,  maxKm: 10, flatFeePaise: 10000, perKmAbovePaise: 0    }, // ₹100 up to 10km
      { minKm: 10, maxKm: 25, flatFeePaise: 10000, perKmAbovePaise: 1500 }, // ₹100 + ₹15/km above 10
      { minKm: 25, maxKm: 50, flatFeePaise: 32500, perKmAbovePaise: 2000 }, // ₹325 + ₹20/km above 25
      { minKm: 50, maxKm: 9999, flatFeePaise: 82500, perKmAbovePaise: 2500 }, // ₹825 + ₹25/km above 50
    ]);
  }

  async createTravelFeeRule(dto: CreateTravelFeeRuleDto): Promise<TravelFeeRule> {
    const entity = this.travelRepo.create(dto as Partial<TravelFeeRule>);
    return this.travelRepo.save(entity);
  }

  async listTravelFeeRules(): Promise<TravelFeeRule[]> {
    return this.travelRepo.find({ order: { maxKm: 'ASC' } });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Discount Codes
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Validates and computes discount amount. Does NOT increment usesCount
   * (call consumeDiscount separately after booking confirmed).
   */
  async applyDiscount(
    code: string,
    orderTotalPaise: number,
    religionSlug: string,
    userId: string,
  ): Promise<number> {
    const discount = await this.discountRepo.findOne({
      where: { code: code.toUpperCase(), isActive: true },
    });
    if (!discount) throw new BadRequestException(`Discount code "${code}" not found`);

    // Expiry
    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestException(`Discount code "${code}" has expired`);
    }

    // Max uses
    if (discount.maxUses !== null && discount.usesCount >= discount.maxUses) {
      throw new BadRequestException(`Discount code "${code}" has been fully redeemed`);
    }

    // Min order (null-safe)
    const minOrderPaise = Number(discount.minOrderPaise ?? 0);
    if (orderTotalPaise < minOrderPaise) {
      throw new BadRequestException(
        `Minimum order INR ${minOrderPaise / 100} required for this code`,
      );
    }

    // validFrom (not-yet-active)
    const discountAny = discount as unknown as Record<string, unknown>;
    if (discountAny['validFrom'] && (discountAny['validFrom'] as Date) > new Date()) {
      throw new BadRequestException(`Discount code "${code}" is not active yet`);
    }

    // Religion restriction
    if (discount.religionSlug && discount.religionSlug !== religionSlug) {
      throw new BadRequestException(`This discount is not valid for your selected faith`);
    }

    let discountPaise = 0;
    if (discount.discountType === DiscountType.PERCENTAGE) {
      discountPaise = Math.round((orderTotalPaise * Number(discount.value)) / 100);
      if (discount.maxDiscountPaise) {
        discountPaise = Math.min(discountPaise, discount.maxDiscountPaise);
      }
    } else {
      discountPaise = Math.min(Number(discount.value), orderTotalPaise);
    }

    if (discountPaise > orderTotalPaise) discountPaise = orderTotalPaise;

    return discountPaise;
  }

  /**
   * Atomic check-and-increment. Returns true if the redemption was claimed.
   */
  async consumeDiscount(code: string): Promise<boolean> {
    const result = await this.discountRepo
      .createQueryBuilder()
      .update()
      .set({ usesCount: () => 'uses_count + 1' })
      .where(
        `LOWER(code) = LOWER(:code) AND is_active = true ` +
          `AND (max_uses IS NULL OR uses_count < max_uses) ` +
          `AND (expires_at IS NULL OR expires_at > now())`,
        { code },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async createDiscountCode(dto: CreateDiscountCodeDto): Promise<DiscountCode> {
    const entity = this.discountRepo.create({
      ...dto,
      code: dto.code.toUpperCase(),
    } as Partial<DiscountCode>);
    return this.discountRepo.save(entity);
  }

  async listDiscountCodes(): Promise<DiscountCode[]> {
    return this.discountRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deactivateDiscountCode(id: string): Promise<DiscountCode> {
    const entity = await this.discountRepo.findOneOrFail({ where: { id } });
    entity.isActive = false;
    return this.discountRepo.save(entity);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Consultation rate validation
  // ────────────────────────────────────────────────────────────────────────────

  validateConsultationRate(ratePaise: number, experienceYears: number): void {
    const bounds = this.getConsultationRateBounds(experienceYears);
    if (ratePaise < bounds.minPaise || ratePaise > bounds.maxPaise) {
      throw new BadRequestException(
        `Consultation rate must be between ₹${bounds.minPaise / 100}–₹${bounds.maxPaise / 100}/min` +
        ` for ${experienceYears} years of experience`,
      );
    }
  }

  getConsultationRateBounds(experienceYears: number): ConsultationRateBounds {
    if (experienceYears < 4)  return { minPaise: 1000, maxPaise: 2000 };
    if (experienceYears < 10) return { minPaise: 1000, maxPaise: 5000 };
    return { minPaise: 1000, maxPaise: 10000 };
  }

  async validatePrice(amount: number, _serviceId: string): Promise<boolean> {
    return amount >= 100 && amount <= 10_000_000;
  }

  async getActiveRules(): Promise<CommissionRule[]> {
    const now = new Date();
    const rules = await this.ruleRepo.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
    return rules.filter(
      (r) => r.effectiveFrom <= now && (r.effectiveTo === null || r.effectiveTo >= now),
    );
  }

  async createRule(dto: CreateCommissionRuleDto): Promise<CommissionRule> {
    const rule = this.ruleRepo.create({
      religionSlug: dto.religionSlug ?? null,
      serviceId: dto.serviceId ?? null,
      providerRole: dto.providerRole ?? null,
      basePct: dto.basePct,
      minFeePaise: dto.minFeePaise ?? null,
      maxFeePaise: dto.maxFeePaise ?? null,
      surgeEnabled: dto.surgeEnabled ?? false,
      surgePct: dto.surgePct ?? 0,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      isActive: true,
    });
    return this.ruleRepo.save(rule);
  }

  async updateRule(id: string, dto: UpdateCommissionRuleDto): Promise<CommissionRule> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`CommissionRule ${id} not found`);
    Object.assign(rule, {
      ...(dto.basePct !== undefined && { basePct: dto.basePct }),
      ...(dto.minFeePaise !== undefined && { minFeePaise: dto.minFeePaise }),
      ...(dto.maxFeePaise !== undefined && { maxFeePaise: dto.maxFeePaise }),
      ...(dto.surgeEnabled !== undefined && { surgeEnabled: dto.surgeEnabled }),
      ...(dto.surgePct !== undefined && { surgePct: dto.surgePct }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.effectiveTo !== undefined && { effectiveTo: dto.effectiveTo }),
    });
    return this.ruleRepo.save(rule);
  }

  async trackTds(
    providerId: string,
    earningsPaise: number,
    financialYear: string,
  ): Promise<TdsRecord> {
    let record = await this.tdsRepo.findOne({ where: { providerId, financialYear } });
    if (!record) {
      record = this.tdsRepo.create({
        providerId,
        financialYear,
        totalEarningsPaise: 0,
        tdsDeductedPaise: 0,
        tdsThresholdPaise: 3_000_000,
        tdsPct: 10.0,
      });
    }
    record.totalEarningsPaise += earningsPaise;
    if (record.totalEarningsPaise > record.tdsThresholdPaise) {
      const taxable = record.totalEarningsPaise - record.tdsThresholdPaise;
      record.tdsDeductedPaise = Math.round((taxable * Number(record.tdsPct)) / 100);
    }
    return this.tdsRepo.save(record);
  }
}
