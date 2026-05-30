import { IsEnum, IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { TicketCategory } from '../entities/ticket.entity';

export class CreateTicketDto {
  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
