import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Query params for GET /temples (the "All India" tab).
 *
 * `search` is matched against name/city using a case-insensitive ILIKE with
 * a prefix + trigram fallback in the service. 2-char minimum keeps very
 * short typos from returning half the table.
 *
 * `city` is a strict equality filter (lowercase comparison). Combining
 * `search` + `city` narrows within a city.
 *
 * Paging uses classic page/limit. Limit is capped at 30 per the spec.
 */
export class ListTemplesDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 30)
  placeType?: string;  // e.g. 'temple', 'mosque', 'church', 'gurudwara', 'dargah'

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit: number = 30;
}
