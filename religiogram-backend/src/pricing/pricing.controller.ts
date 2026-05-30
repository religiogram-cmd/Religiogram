import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PricingService } from './pricing.service';
import {
  CreateCommissionRuleDto, UpdateCommissionRuleDto,
  CreateHolidaySurgeDto, CreateDiscountCodeDto, CreateTravelFeeRuleDto,
  ComputeBookingPriceDto, ValidateDiscountDto,
} from './dto/pricing.dto';

@ApiTags('pricing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'pricing', version: '1' })
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  // ── Commission rules (admin only) ──────────────────────────────────────────
  @Get('rules')
  @Roles('admin')
  async getRules() {
    return this.pricingService.getActiveRules();
  }

  @Post('rules')
  @Roles('admin')
  async createRule(@Body() dto: CreateCommissionRuleDto) {
    return this.pricingService.createRule(dto);
  }

  @Patch('rules/:id')
  @Roles('admin')
  async updateRule(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.pricingService.updateRule(id, dto);
  }

  // ── Booking price computation (authenticated users) ────────────────────────
  @Post('compute')
  async computePrice(@Body() dto: ComputeBookingPriceDto, @Query('userId') userId?: string) {
    return this.pricingService.computeBookingPrice({
      serviceId: dto.serviceId,
      basePricePaise: dto.basePricePaise,
      religionSlug: dto.religionSlug,
      providerRole: dto.providerRole,
      serviceDate: dto.serviceDate,
      distanceKm: dto.distanceKm ?? 0,
      addOnsTotalPaise: dto.addOnsTotalPaise ?? 0,
      discountCode: dto.discountCode,
      userId,
    });
  }

  // ── Holiday surges ─────────────────────────────────────────────────────────
  @Get('surges')
  @Public()
  async listSurges() {
    return this.pricingService.listHolidaySurges();
  }

  @Post('surges')
  @Roles('admin')
  async createSurge(@Body() dto: CreateHolidaySurgeDto) {
    return this.pricingService.createHolidaySurge(dto);
  }

  @Patch('surges/:id')
  @Roles('admin')
  async updateSurge(@Param('id') id: string, @Body() dto: Partial<CreateHolidaySurgeDto>) {
    return this.pricingService.updateHolidaySurge(id, dto);
  }

  @Delete('surges/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSurge(@Param('id') id: string) {
    await this.pricingService.deleteHolidaySurge(id);
  }

  // ── Travel fees ────────────────────────────────────────────────────────────
  @Get('travel-fees')
  @Public()
  async listTravelFees() {
    return this.pricingService.listTravelFeeRules();
  }

  @Post('travel-fees')
  @Roles('admin')
  async createTravelFee(@Body() dto: CreateTravelFeeRuleDto) {
    return this.pricingService.createTravelFeeRule(dto);
  }

  // ── Discount codes ─────────────────────────────────────────────────────────
  @Get('discounts')
  @Roles('admin')
  async listDiscounts() {
    return this.pricingService.listDiscountCodes();
  }

  @Post('discounts')
  @Roles('admin')
  async createDiscount(@Body() dto: CreateDiscountCodeDto) {
    return this.pricingService.createDiscountCode(dto);
  }

  @Patch('discounts/:id/deactivate')
  @Roles('admin')
  async deactivateDiscount(@Param('id') id: string) {
    return this.pricingService.deactivateDiscountCode(id);
  }

  @Post('discounts/validate')
  async validateDiscount(@Body() dto: ValidateDiscountDto, @Query('userId') userId = 'anon') {
    const discountPaise = await this.pricingService.applyDiscount(
      dto.code, dto.orderTotalPaise, dto.religionSlug, userId,
    );
    return { valid: true, discountPaise };
  }
}
