import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { AdminUpdateTicketDto } from './dto/admin-update-ticket.dto';
import { TicketStatus, TicketPriority } from './entities/ticket.entity';

@Controller({ path: 'support', version: '1' })
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ---------------------------------------------------------------------------
  // User endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /support/tickets
   * Create a new support ticket for the authenticated user.
   */
  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  createTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.createTicket(user.id, dto);
  }

  /**
   * GET /support/tickets?page=1&limit=20
   * Paginated list of the calling user's tickets.
   */
  @Get('tickets')
  getUserTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.supportService.getMyTickets(user.id);
  }

  /**
   * GET /support/tickets/:id
   * Get a single ticket (owner only).
   */
  @Get('tickets/:id')
  getTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.getTicket(id, user.id);
  }

  /**
   * POST /support/tickets/:id/messages
   * Add a user message to a ticket.
   */
  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body() dto: AddMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.addUserMessage(ticketId, user.id, dto);
  }

  /**
   * GET /support/tickets/:id/messages
   * Get messages for a ticket (owner only).
   */
  @Get('tickets/:id/messages')
  getMessages(
    @Param('id', ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.getMessages(ticketId, user.id);
  }

  // ---------------------------------------------------------------------------
  // Admin endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /support/admin/tickets?status=open&priority=p1_critical
   * Admin: paginated view of all tickets ordered by SLA deadline.
   */
  @Get('admin/tickets')
  @Roles('admin')
  getAdminQueue(
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
  ) {
    return this.supportService.getAdminQueue({ status, priority });
  }

  /**
   * PATCH /support/admin/tickets/:id/assign
   * Admin: assign ticket to an agent.
   */
  @Patch('admin/tickets/:id/assign')
  @Roles('admin')
  assignTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.adminUpdateTicket(id, user.id, dto);
  }

  /**
   * PATCH /support/admin/tickets/:id/close
   * Admin: resolve / close a ticket.
   */
  @Patch('admin/tickets/:id/close')
  @Roles('admin')
  closeTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.resolveTicket(id, user.id, body.note ?? 'Closed by admin');
  }
}
