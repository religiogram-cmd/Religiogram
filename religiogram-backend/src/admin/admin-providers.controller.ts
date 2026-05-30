import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity, ProviderStatus } from '../service-providers/entities/provider.entity';
import { AdminAuditService } from './admin-audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { encodeCursor, decodeCursor } from '../common/pagination/cursor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

class ModerateProviderDto {
  @IsEnum(['approve', 'reject', 'suspend', 'ban'], {
    message: 'action must be one of: approve, reject, suspend, ban',
  })
  action!: 'approve' | 'reject' | 'suspend' | 'ban';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

/**
 * Admin console: Provider moderation
 * Approve / reject / suspend / ban service providers.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/providers', version: '1' })
export class AdminProvidersController {
  private readonly logger = new Logger(AdminProvidersController.name);
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    private readonly audit: AdminAuditService,
    private readonly bookingsSvc: BookingsService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: ProviderStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    // P1-14 (v5): keyset pagination so admin queues stay O(log n) past 1M rows.
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const qb = this.providerRepo.createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(safeLimit + 1);
    if (status) qb.andWhere('p.status = :status', { status });
    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere('(p.createdAt < :d OR (p.createdAt = :d AND p.id < :i))', { d, i });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];
    return {
      data: rows,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, String(last.id)) : null,
    };
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerRepo.findOneOrFail({ where: { id } });
  }

  @Patch(':id/moderate')
  @HttpCode(HttpStatus.OK)
  async moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateProviderDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const provider = await this.providerRepo.findOneOrFail({ where: { id } });

    const statusMap: Record<ModerateProviderDto['action'], ProviderStatus> = {
      approve:  ProviderStatus.Approved,
      reject:   ProviderStatus.Rejected,
      suspend:  ProviderStatus.Suspended,
      ban:      ProviderStatus.Suspended,  // Ban re-uses Suspended; mark via rejectionReason
    };

    const update: Partial<ProviderEntity> = {
      status: statusMap[dto.action],
      rejectionReason: dto.reason ?? null,
      approvedAt: dto.action === 'approve' ? new Date() : undefined,
    };

    await this.providerRepo.update(id, update);

    await this.audit.log({
      adminId: me.id,
      actionType: `provider.${dto.action}`,
      targetType: 'provider',
      targetId: id,
      justification: dto.reason ?? "",
    });

    // Auto-cancel pending/confirmed bookings when provider is suspended or banned.
    // This prevents users from showing up to a booking with a suspended provider.
    if (dto.action === 'suspend' || dto.action === 'ban') {
      const cancelled = await this.bookingsSvc.cancelBookingsByProvider(id, `provider_${dto.action}`);
      this.logger.log({ providerId: id, cancelled }, `Auto-cancelled ${cancelled} bookings on provider ${dto.action}`);
    }

    return { success: true, providerId: id, newStatus: update.status };
  }
}
