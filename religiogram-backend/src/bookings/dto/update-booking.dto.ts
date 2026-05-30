import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { BookingStatus } from '../entities/booking.entity';

export class UpdateBookingDto {
  @IsEnum([BookingStatus.CANCELLED, BookingStatus.COMPLETED])
  status!: BookingStatus.CANCELLED | BookingStatus.COMPLETED;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  cancellationReason?: string;
}
