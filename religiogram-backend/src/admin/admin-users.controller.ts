import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

import { AccountStatus, User } from '../users/entities/user.entity';
import { ProviderEntity } from '../service-providers/entities/provider.entity';

import { AdminAuditService } from './admin-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

import { encodeCursor, decodeCursor } from '../common/pagination/cursor';

class UpdateUserStatusDto {
  @IsEnum([AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.BANNED], {
    message: 'status must be one of: active, suspended, banned',
  })
  status!: AccountStatus.ACTIVE | AccountStatus.SUSPENDED | AccountStatus.BANNED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Admin console — user management.
 *
 * List users with filters/search, inspect a single user (with provider
 * sub-row if the user is also a provider), and change account_status
 * (active/suspended/banned). Every status change is audited and the user
 * is notified.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    private readonly audit: AdminAuditService,
    private readonly notifs: NotificationsService,
  ) {}

  /* ─── GET /v1/admin/users ─── */
  @Get()
  async list(
    @Query('role') role?: 'seeker' | 'advisor' | 'admin',
    @Query('status') status?: AccountStatus,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

    const qb = this.userRepo.createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .take(safeLimit + 1);

    if (role) qb.andWhere('u.role = :role', { role });
    if (status) qb.andWhere('u.accountStatus = :accountStatus', { accountStatus: status });

    if (q && q.trim().length > 0) {
      const like = `%${q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(u.name) LIKE :like', { like })
            .orWhere('LOWER(u.email) LIKE :like', { like });
        }),
      );
    }

    if (cursor) {
      const { d, i } = decodeCursor(cursor);
      qb.andWhere('(u.createdAt < :d OR (u.createdAt = :d AND u.id < :i))', { d, i });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];

    // One extra query to figure out which of these users are also providers.
    // Cheap: one IN() lookup keyed by user_id, then a Set membership test.
    const providerUserIds = rows.length
      ? new Set(
          (
            await this.providerRepo.find({
              where: { userId: In(rows.map((r) => r.id)) },
              select: ['userId'],
            })
          ).map((p) => p.userId),
        )
      : new Set<string>();

    const items = rows.map((u) => ({
      id:            u.id,
      name:          u.name,
      email:         u.email,
      role:          u.role,
      accountStatus: u.accountStatus,
      isActive:      u.isActive,
      createdAt:     u.createdAt,
      isProvider:    providerUserIds.has(u.id),
    }));

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, String(last.id)) : null,
      hasMore,
    };
  }

  /* ─── GET /v1/admin/users/:id ─── */
  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const provider = await this.providerRepo.findOne({ where: { userId: id } });

    return {
      id:            user.id,
      name:          user.name,
      firstName:     user.firstName,
      lastName:      user.lastName,
      displayName:   user.displayName,
      email:         user.email,
      phone:         user.phone,
      role:          user.role,
      accountStatus: user.accountStatus,
      isActive:      user.isActive,
      isVerified:    user.isVerified,
      createdAt:     user.createdAt,
      updatedAt:     user.updatedAt,
      lastLoginAt:   user.lastLoginAt,
      provider: provider
        ? {
            id:               provider.id,
            status:           provider.status,
            providerCategory: provider.providerCategory,
            fullName:         provider.fullName,
            city:             provider.city,
            religion:         provider.religion,
            bio:              provider.bio,
            perMinutePaise:   provider.perMinutePaise,
            ratingAvg:        provider.ratingAvg,
            ratingCount:      provider.ratingCount,
            isOnline:         provider.isOnline,
          }
        : null,
    };
  }

  /* ─── PATCH /v1/admin/users/:id/status ─── */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (me.id === id) {
      throw new ForbiddenException('You cannot change your own account status');
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // ValidationPipe already enforces the enum, but keep a runtime guard so
    // the DB never sees a value outside the expected set.
    if (
      dto.status !== AccountStatus.ACTIVE &&
      dto.status !== AccountStatus.SUSPENDED &&
      dto.status !== AccountStatus.BANNED
    ) {
      throw new BadRequestException('Invalid status');
    }

    const previous = user.accountStatus;
    await this.userRepo.update({ id }, { accountStatus: dto.status });

    await this.audit.log({
      adminId:      me.id,
      actionType:   `user.status.${dto.status}`,
      targetType:   'user',
      targetId:     id,
      beforeState:  { accountStatus: previous },
      afterState:   { accountStatus: dto.status },
      justification: dto.reason ?? '',
    });

    // Notify the user — use a friendly message per state.
    const title =
      dto.status === AccountStatus.ACTIVE     ? 'Account reinstated'
      : dto.status === AccountStatus.SUSPENDED ? 'Account suspended'
      :                                          'Account banned';

    const body =
      dto.status === AccountStatus.ACTIVE
        ? 'Your account has been reinstated. Welcome back to ReligioGram.'
        : dto.status === AccountStatus.SUSPENDED
          ? `Your account has been suspended.${dto.reason ? ` Reason: ${dto.reason}.` : ''} Contact support for assistance.`
          : `Your account has been banned.${dto.reason ? ` Reason: ${dto.reason}.` : ''} Contact support if you believe this is a mistake.`;

    await this.notifs
      .send(id, NotificationType.SYSTEM, title, body)
      .catch((e) =>
        this.logger.warn(
          `Failed to notify user ${id} of status change: ${(e as Error).message}`,
        ),
      );

    return { id, accountStatus: dto.status };
  }
}
