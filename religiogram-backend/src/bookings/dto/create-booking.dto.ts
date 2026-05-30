import {
  IsString,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Min,
  Max,
  Length,
  IsUUID,
} from 'class-validator';
import { BookingType } from '../entities/booking.entity';

/**
 * v4 (P0-2): client no longer supplies `amountPaise`. The booking price is
 * computed server-side by PricingService.computeBookingPrice() from the
 * provider's price-card + add-ons + surge. The client picks a service and a
 * time; we tell them the price.
 */
export class CreateBookingDto {
  @IsString()
  providerId!: string;

  @IsUUID()
  serviceId!: string;

  @IsEnum(BookingType)
  type!: BookingType;

  /** ISO-8601 UTC timestamp e.g. "2024-12-25T10:00:00Z" */
  @IsISO8601({ strict: true })
  scheduledAt!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  notes?: string;
}
