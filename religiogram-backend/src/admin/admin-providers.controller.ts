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
  NotFoundException,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConsultationChannel,
  ProviderCategory,
  ProviderEntity,
  ProviderReligion,
  ProviderStatus,
} from '../service-providers/entities/provider.entity';
import { AdminAuditService } from './admin-audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { RankingService } from '../service-providers/ranking.service';
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

class EditProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  bio?: string;

  @IsOptional()
  @IsEnum(ProviderReligion)
  religion?: ProviderReligion;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsEnum(['offline', 'online', 'both'], {
    message: 'serviceMode must be one of: offline, online, both',
  })
  serviceMode?: 'offline' | 'online' | 'both';

  @IsOptional()
  @IsEnum(ProviderCategory)
  providerCategory?: ProviderCategory;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(100000)
  perMinutePaise?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  specialisations?: string[];

  @IsOptional()
  @IsObject()
  specialisationYears?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(ConsultationChannel, { each: true })
  consultationChannels?: ConsultationChannel[];
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
    private readonly ranking: RankingService,
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

  /**
   * PATCH /v1/admin/providers/:id
   * Edit provider professional fields. All body fields are optional; only
   * fields present in the request are applied. Every edit is audited and
   * the ranking score is refreshed (bio → completeness, perMinutePaise,
   * providerCategory all influence the score).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async edit(
    @Param('id') id: string,
    @Body() dto: EditProviderDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');

    // Build the diff — only fields explicitly present in the DTO.
    const diff: Partial<ProviderEntity> = {};
    const editableKeys: (keyof EditProviderDto)[] = [
      'fullName',
      'city',
      'bio',
      'religion',
      'experienceYears',
      'languages',
      'serviceMode',
      'providerCategory',
      'perMinutePaise',
      'specialisations',
      'specialisationYears',
      'consultationChannels',
    ];
    for (const key of editableKeys) {
      if (dto[key] !== undefined) {
        (diff as any)[key] = dto[key];
      }
    }

    if (Object.keys(diff).length === 0) {
      // Nothing to update — return the current row unchanged.
      return provider;
    }

    await this.providerRepo.update({ id }, diff);

    await this.audit.log({
      adminId:       me.id,
      actionType:    'provider.edit',
      targetType:    'provider',
      targetId:      String(id),
      justification: JSON.stringify(diff),
    });

    // Bump ranking score — bio/perMinutePaise/category all affect it.
    // Non-blocking; log if it errors so the edit still returns 200.
    this.ranking.bump(String(id)).catch((e) =>
      this.logger.warn(`ranking bump after provider.edit failed: ${(e as Error).message}`),
    );

    return this.providerRepo.findOne({ where: { id } });
  }
}
