import { IsOptional, IsString, IsNumber, IsEnum, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum FaithFilter {
  HINDU    = 'hindu',
  MUSLIM   = 'islam',
  SIKH     = 'sikh',
  CHRISTIAN = 'christian',
}

export enum SortBy {
  RATING     = 'rating',
  PRICE      = 'price',
  EXPERIENCE = 'experience',
  DISTANCE   = 'distance',
}

export class QueryPriestsDto {
  @ApiPropertyOptional({ enum: FaithFilter, description: 'Filter by religion' })
  @IsOptional()
  @IsEnum(FaithFilter)
  faith?: FaithFilter;

  @ApiPropertyOptional({ description: 'Filter by service name (matched against provider services)' })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({ description: 'Filter by city (case-insensitive)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Latitude for geo-distance filtering' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for geo-distance filtering' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ default: 50, description: 'Radius in km for geo filter (requires lat+lng)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  radiusKm?: number = 50;

  @ApiPropertyOptional({ enum: SortBy, default: SortBy.RATING })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.RATING;

  @ApiPropertyOptional({ default: 20, maximum: 50, description: 'Page size (max 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Opaque base64url cursor from previous page nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Full-text search across name and bio' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter to providers offering online consultations' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isOnline?: boolean;

  @ApiPropertyOptional({ description: 'Filter by available date (ISO date string, e.g. 2025-06-15)' })
  @IsOptional()
  @IsString()
  availableDate?: string;

  @ApiPropertyOptional({ description: 'Minimum per-minute rate in paise (e.g. 500 = ₹5/min)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum per-minute rate in paise (e.g. 5000 = ₹50/min)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}
