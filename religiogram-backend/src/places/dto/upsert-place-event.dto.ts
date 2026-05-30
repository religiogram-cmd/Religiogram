import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/**
 * Admin DTO for creating / updating a place event.
 *
 * Dates
 * -----
 * `startTime` and `endTime` are ISO8601 strings on the wire. The service
 * layer turns them into `Date` for TypeORM. We deliberately don't
 * `@Transform(({ value }) => new Date(value))` here because validation
 * runs BEFORE transform and we want to reject malformed strings with a
 * useful 400 rather than let a NaN Date sneak into the query layer.
 *
 * `endTime` is optional; when present, the service enforces
 * endTime > startTime at the service layer (harder to express cleanly
 * in class-validator without a reference-to-sibling helper).
 */
export class CreatePlaceEventDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsDateString()
  startTime!: string;

  /** Forbid an empty-string endTime (common UI footgun) by gating on presence. */
  @ValidateIf((_: unknown, v: unknown) => v !== undefined && v !== null && v !== '')
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;
}

/**
 * Update allows any subset of the create fields. TypeORM partial update
 * semantics mean un-mentioned fields keep their prior values, so the
 * API is PATCH-shaped even though the method is PUT.
 */
export class UpdatePlaceEventDto extends PartialType(CreatePlaceEventDto) {}
