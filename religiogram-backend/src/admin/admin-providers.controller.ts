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
import { AccountStatus, User } from '../users/entities/user.entity';
import { TokenService } from '../auth/services/token.service';
import { RedisService } from '../redis/redis.service';

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AdminAuditService,
    private readonly bookingsSvc: BookingsService,
    private readonly ranking: RankingService,
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Serialize a provider row for the admin console. Normalises the raw
   * `ProviderStatus` enum so the frontend can use a simpler union:
   *   - `pending_review` → `pending` (admin UI groups draft under the
   *     Pending Review filter for simplicity — very few rows sit in
   *     `draft` post-submission)
   *   - `draft`          → `pending`
   *   - `banned` bit lives in `rejectionReason` prefix (BANNED:) — we
   *     surface it as a distinct `banned` status here so the badge can
   *     colour differently from a plain Suspended.
   */
  private serialize(p: ProviderEntity) {
    let status: string = p.status;
    if (status === ProviderStatus.PendingReview || status === ProviderStatus.Draft) {
      status = 'pending';
    } else if (
      status === ProviderStatus.Suspended &&
      typeof p.rejectionReason === 'string' &&
      p.rejectionReason.startsWith('BANNED:')
    ) {
      status = 'banned';
    }
    return {
      id:               p.id,
      fullName:         p.fullName ?? null,
      city:             p.city ?? null,
      religion:         p.religion ?? null,
      providerCategory: p.providerCategory,
      status,
      ratingAvg:        p.ratingAvg ? parseFloat(p.ratingAvg as string) : null,
      ratingCount:      p.ratingCount,
      perMinutePaise:   p.perMinutePaise,
      createdAt:        p.createdAt?.toISOString?.() ?? p.createdAt,
      // Full-detail fields (used by the edit modal — safe to always send)
      bio:              p.bio ?? null,
      experienceYears:  p.experienceYears,
      languages:        p.languages ?? [],
      serviceMode:      p.serviceMode,
      specialisations:  p.specialisations ?? [],
      specialisationYears:  p.specialisationYears ?? {},
      consultationChannels: p.consultationChannels ?? [],
    };
  }

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    // P1-14 (v5): keyset pagination so admin queues stay O(log n) past 1M rows.
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const qb = this.providerRepo.createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(safeLimit + 1);

    // Accept the frontend's UI-friendly `pending` alias in addition to the
    // raw enum values. `banned` isn't a real enum state — it maps to
    // Suspended + rejectionReason LIKE 'BANNED:%'.
    if (status) {
      if (status === 'pending') {
        qb.andWhere('p.status IN (:...pendingStatuses)', {
          pendingStatuses: [ProviderStatus.PendingReview, ProviderStatus.Draft],
        });
      } else if (status === 'banned') {
        qb.andWhere('p.status = :suspended', { suspended: ProviderStatus.Suspended })
          .andWhere("p.rejectionReason LIKE 'BANNED:%'");
      } else if (status === 'suspended') {
        // Explicitly EXCLUDE banned rows from the plain Suspended filter.
        qb.andWhere('p.status = :suspended', { suspended: ProviderStatus.Suspended })
          .andWhere("(p.rejectionReason IS NULL OR p.rejectionReason NOT LIKE 'BANNED:%')");
      } else {
        qb.andWhere('p.status = :status', { status });
      }
    }

    // Category filter (was silently ignored before this fix).
    if (category && (category === 'priest' || category === 'astrologer' || category === 'both')) {
      qb.andWhere('p.providerCategory = :category', { category });
    }

    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere('(p.createdAt < :d OR (p.createdAt = :d AND p.id < :i))', { d, i });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];
    return {
      items: rows.map((p) => this.serialize(p)),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, String(last.id)) : null,
      hasMore,
    };
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const p = await this.providerRepo.findOneOrFail({ where: { id } });
    return this.serialize(p);
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

    /* Distinguish ban vs plain suspend by prefixing rejectionReason with
     * `BANNED:`. The list serializer maps this back to a `banned` status
     * so the admin UI can render a distinct badge. */
    const reason = dto.reason ?? '';
    const rejectionReason = dto.action === 'ban'
      ? `BANNED:${reason}`
      : (dto.action === 'suspend' || dto.action === 'reject') ? reason : null;

    const update: Partial<ProviderEntity> = {
      status: statusMap[dto.action],
      rejectionReason,
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

      /* ─── Cascade to user account.
       * Previously suspending/banning a provider left their user account
       * ACTIVE, so their sessions kept minting new access tokens and they
       * could still log in / DM / post socially. Match the behaviour of
       * admin-users.controller::updateStatus: flip accountStatus, revoke
       * refresh tokens, stamp minIat so any live JWT is rejected on next
       * request, and let the socket gateways hang up via the pub/sub. */
      const newAccountStatus =
        dto.action === 'ban' ? AccountStatus.BANNED : AccountStatus.SUSPENDED;
      const userId = provider.userId;
      if (userId) {
        try {
          await this.userRepo.update({ id: userId }, { accountStatus: newAccountStatus });
        } catch (e) {
          this.logger.warn(`user status cascade failed for ${userId}: ${(e as Error).message}`);
        }
        const nowSec = Math.floor(Date.now() / 1000);
        await Promise.all([
          this.tokens.revokeAllForUser(userId).catch((e) =>
            this.logger.warn(`revokeAllForUser failed for ${userId}: ${(e as Error).message}`),
          ),
          this.redis.getClient().set(`user:${userId}:minIat`, String(nowSec)).catch((e) =>
            this.logger.warn(`minIat stamp failed for ${userId}: ${(e as Error).message}`),
          ),
        ]);
        // Second audit row so the user-level cascade is discoverable in the
        // admin log even when searching by target_type='user'.
        await this.audit.log({
          adminId: me.id,
          actionType: `user.status.${newAccountStatus}`,
          targetType: 'user',
          targetId: userId,
          justification: `Cascaded from provider ${dto.action}: ${dto.reason ?? ''}`,
        }).catch(() => {});
      }
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

    const fresh = await this.providerRepo.findOne({ where: { id } });
    return fresh ? this.serialize(fresh) : null;
  }
}
