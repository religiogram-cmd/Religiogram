import { IsString, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { TicketStatus } from '../entities/ticket.entity';

export class ResolveTicketDto {
  @IsString()
  @MaxLength(2000)
  resolutionNote!: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
