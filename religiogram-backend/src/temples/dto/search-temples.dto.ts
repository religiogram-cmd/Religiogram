import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Query params for GET /temples/search — the backend fallback used when
 * Google Places Autocomplete is unavailable, quota-blocked, or returns
 * zero predictions.
 *
 * Matched against name / city / address with a single ILIKE expression;
 * see service. 2-char minimum keeps the query selective; 40-char cap
 * prevents abuse.
 */
export class SearchTemplesDto {
  @IsString()
  @Length(2, 40)
  q!: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}
