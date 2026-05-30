import { IsEnum, IsString, IsUUID, IsInt, Min, MaxLength } from 'class-validator';
import { CancellationBy } from '../entities/refund-request.entity';

export class CreateRefundDto {
  @IsUUID() bookingId!: string;
  @IsUUID() userId!: string;
  @IsInt() @Min(1) amountPaise!: number;
  @IsString() @MaxLength(100) reason!: string;
  @IsEnum(CancellationBy) cancellationBy!: CancellationBy;
  @IsString() idempotencyKey!: string;
}
