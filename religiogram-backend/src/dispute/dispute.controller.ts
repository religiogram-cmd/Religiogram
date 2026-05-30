import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards, DefaultValuePipe, ParseIntPipe} from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { RaiseDisputeDto } from './dto/raise-dispute.dto';
import {
  ResolveForUserDto,
  ResolveForProviderDto,
  AddMessageDto,
} from './dto/resolve-dispute.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'disputes', version: '1' })
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  /** POST /disputes — raise a new dispute (authenticated user) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  raise(
    @Body() dto: RaiseDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.disputeService.raise(user.id, dto);
  }

  /** GET /disputes/admin/queue — pending disputes sorted by SLA (admin) */
  @Get('admin/queue')
  @Roles('admin')
  getAdminQueue(@Query('status') status?: string) {
    return this.disputeService.getAdminQueue(status);
  }

  /** GET /disputes/my — caller's own disputes */
  @Get('my')
  getUserDisputes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.disputeService.getUserDisputes(user.id, cursor, limit);
  }

  /** GET /disputes/:id */
  @Get(':id')
  getDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.disputeService.getDispute(id, user.id, user.role);
  }

  /** POST /disputes/:id/messages — add a message thread entry */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = user.role ?? 'user';
    return this.disputeService.addMessage(id, user.id, role, dto.message);
  }

  /** POST /disputes/:id/investigate (admin) */
  @Post(':id/investigate')
  @Roles('admin')
  investigate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.disputeService.investigate(id, admin.id);
  }

  /** POST /disputes/:id/resolve-user (admin) */
  @Post(':id/resolve-user')
  @Roles('admin')
  resolveForUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveForUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.disputeService.resolveForUser(id, admin.id, dto);
  }

  /** POST /disputes/:id/resolve-provider (admin) */
  @Post(':id/resolve-provider')
  @Roles('admin')
  resolveForProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveForProviderDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.disputeService.resolveForProvider(id, admin.id, dto);
  }

  /** POST /disputes/:id/escalate (admin) */
  @Post(':id/escalate')
  @Roles('admin')
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.disputeService.escalate(id, admin.id);
  }
}
