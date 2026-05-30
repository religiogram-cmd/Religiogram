import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewableType } from '../entities/review.entity';

export class ListReviewsDto {
  @IsEnum(ReviewableType)
  reviewableType!: ReviewableType;

  @IsUUID()
  reviewableId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;
}
