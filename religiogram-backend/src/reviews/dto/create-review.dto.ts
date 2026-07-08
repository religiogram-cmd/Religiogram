import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { ReviewableType } from '../entities/review.entity';

export class CreateReviewDto {
  @IsEnum(ReviewableType)
  reviewableType!: ReviewableType;

  /* Widened from IsUUID to accept both:
   *   - temple/place UUIDs (uuid pk)
   *   - provider bigint ids serialized as strings (bigint pk)
   * See migration 072 which widened the underlying column to varchar(64). */
  @IsString()
  @MaxLength(64)
  @Matches(/^[0-9a-fA-F-]+$/, {
    message: 'reviewableId must be a UUID or numeric id',
  })
  reviewableId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  body?: string;
}
