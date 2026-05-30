import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/**
 * Admin DTO for creating / updating a place service.
 *
 * Neutrality is enforced by convention, not schema. We accept any
 * non-empty name and rely on admin curation to keep things generic
 * enough. A future editorial guideline can ship as a tooltip in the
 * admin UI without backend changes.
 */
export class CreatePlaceServiceDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdatePlaceServiceDto extends PartialType(CreatePlaceServiceDto) {}
