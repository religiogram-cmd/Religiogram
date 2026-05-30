import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateCommissionRuleDto {
  @ApiPropertyOptional({ description: "null = applies to all religions" })
  @IsOptional()
  @IsString()
  religionSlug?: string;

  @ApiPropertyOptional({ description: "null = applies to all services in religion" })
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRole?: string;

  @ApiProperty({ default: 15.0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  basePct!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minFeePaise?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxFeePaise?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  surgeEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  surgePct?: number;

  @ApiProperty()
  @Type(() => Date)
  effectiveFrom!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  effectiveTo?: Date;
}

export class UpdateCommissionRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  basePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minFeePaise?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxFeePaise?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  surgeEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  surgePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  effectiveTo?: Date;
}

export class CalculateFeeDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ description: "Amount in paise" })
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiProperty()
  @IsString()
  religionSlug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRole?: string;
}

// ── Holiday Surge ─────────────────────────────────────────────────────────────
import { IsDateString } from 'class-validator';

export class CreateHolidaySurgeDto {
  @IsString() name!: string;
  @IsOptional() @IsString() religionSlug?: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsNumber() @Min(1.0) @Max(1.5) multiplier!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateTravelFeeRuleDto {
  @IsNumber() @Min(0) minKm!: number;
  @IsNumber() @Min(1) maxKm!: number;
  @IsNumber() @Min(0) flatFeePaise!: number;
  @IsNumber() @Min(0) perKmAbovePaise!: number;
}

export class CreateDiscountCodeDto {
  @IsString() code!: string;
  @IsString() discountType!: string; // percentage | fixed
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsNumber() maxDiscountPaise?: number;
  @IsOptional() @IsNumber() minOrderPaise?: number;
  @IsOptional() @IsNumber() maxUses?: number;
  @IsOptional() @IsNumber() maxUsesPerUser?: number;
  @IsOptional() @IsString() religionSlug?: string;
  @IsOptional() expiresAt?: Date;
}

export class ValidateDiscountDto {
  @IsString() code!: string;
  @IsNumber() orderTotalPaise!: number;
  @IsString() religionSlug!: string;
}

export class ComputeBookingPriceDto {
  @IsString() serviceId!: string;
  @IsNumber() basePricePaise!: number;
  @IsString() religionSlug!: string;
  @IsOptional() @IsString() providerRole?: string;
  @IsDateString() serviceDate!: string;
  @IsOptional() @IsNumber() distanceKm?: number;
  @IsOptional() @IsNumber() addOnsTotalPaise?: number;
  @IsOptional() @IsString() discountCode?: string;
}
