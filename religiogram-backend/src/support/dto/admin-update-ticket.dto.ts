import { IsOptional, IsEnum, IsString } from 'class-validator';
import { TicketStatus, TicketPriority } from '../entities/ticket.entity';

export class AdminUpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  assignedAgentId?: string;

  @IsOptional()
  @IsString()
  resolutionNote?: string;
}
