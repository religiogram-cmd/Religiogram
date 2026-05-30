import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Payload for `POST /admin/temples`.
 *
 * All write fields live here. We deliberately don't accept `id`,
 * `createdAt`, `updatedAt`, or `location` — those are server-owned.
 * The geography column is computed from lat/lng in the service.
 */
export class CreateTempleDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsString()
  @Length(2, 100)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  state?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  address?: string;

  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingAvg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratingCount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  hours?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  deity?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  /**
   * Must be an absolute URL. In production this will typically be a
   * CloudFront signed URL pointing at our private S3 bucket. We don't
   * enforce the CDN host here because staging / local use different
   * buckets — the Next/Image host allowlist does that last-mile filter.
   */
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(0, 2048)
  imageUrl?: string;

  /**
   * Override the pg_trgm similarity dup-check. When true, the service will
   * still compute similarity against same-city temples and log any near-
   * matches, but it will NOT fail with 409. Use deliberately — an admin
   * confirming "yes, these two temples really are distinct".
   *
   * Not persisted. Stripped from the SQL insert.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * Payload for `PUT /admin/temples/:id`.
 *
 * All fields are optional so admins can patch one field at a time
 * without retransmitting the whole record. Not using PartialType from
 * `@nestjs/mapped-types` here to avoid the extra dep + to surface the
 * optional-everywhere semantics plainly.
 */
export class UpdateTempleDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  state?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingAvg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ratingCount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  hours?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  deity?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(0, 2048)
  imageUrl?: string;
}

/**
 * Query params for `GET /admin/temples` — unchecked admin listing with
 * page/limit. Deliberately allows up to 100 per page (vs 30 for the
 * public list) so an admin can sweep through catalogue fixes efficiently.
 */
export class ListAdminTemplesDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  /**
   * When true, include unverified temples. Default true for admins —
   * distinguishes this listing from the public one.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeUnverified: boolean = true;
}
