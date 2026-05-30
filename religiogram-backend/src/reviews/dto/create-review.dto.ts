import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewableType } from '../entities/review.entity';

export class CreateReviewDto {
  @IsEnum(ReviewableType)
  reviewableType!: ReviewableType;

  @IsUUID()
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
