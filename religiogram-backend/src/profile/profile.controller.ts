import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Profile REST surface.
 *
 *   GET    /profile         → current user's profile (or 404 if none)
 *   POST   /profile         → idempotent create
 *   PATCH  /profile         → partial update / draft autosave
 *   GET    /profile/:userId → admin-only, read any user's profile
 *
 * RBAC:
 *   - All "/profile" (no userId) routes are scoped to the caller via
 *     `@CurrentUser()`. There's no path parameter to spoof.
 *   - The admin route uses @Roles('admin') so the global RolesGuard
 *     enforces it without us re-checking inside the handler.
 *   - We deliberately don't expose PATCH-by-userId to admins yet —
 *     editing another user's profile is a destructive operation and
 *     should go through a dedicated audit-logged endpoint when needed.
 */
@Controller({ path: 'profile', version: '1' })
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    const row = await this.profile.get(user.id);
    return this.serialize(row);
  }

  @Post()
  @HttpCode(200) // idempotent — 200 on either insert or "already exists"
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertProfileDto,
  ) {
    const row = await this.profile.createOrGet(user.id, dto);
    return this.serialize(row);
  }

  @Patch()
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertProfileDto,
  ) {
    const row = await this.profile.update(user.id, dto);
    return this.serialize(row);
  }

  /**
   * Admin-only. Path-param userId — the global RolesGuard ensures only
   * admins reach this handler, but we add a belt-and-braces check so a
   * future bug in the guard chain can't leak data.
   */
  @Get(':userId')
  @Roles('admin')
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException();
    }
    const row = await this.profile.get(userId);
    return this.serialize(row);
  }

  /* ─── Serialisation ──────────────────────────────────────── */
  private serialize(row: {
    userId: string;
    step: number;
    data: Record<string, unknown>;
    completed: boolean;
    updatedAt: Date;
  }) {
    return {
      userId: row.userId,
      step: row.step,
      data: row.data ?? {},
      completed: row.completed,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
