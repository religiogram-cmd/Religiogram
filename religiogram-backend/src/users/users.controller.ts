import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserThrottle, UserThrottleGuard } from '../common/guards/user-throttle.guard';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type {
  AuthenticatedUser,
  UserRole,
} from '../auth/interfaces/jwt-payload.interface';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  /** Seeker faith preference. Drives Holy Places + Priests faceting. */
  @IsOptional()
  @IsIn(['all', 'hindu', 'muslim', 'sikh', 'christian'])
  faith?: 'all' | 'hindu' | 'muslim' | 'sikh' | 'christian';
}

class UpdateRoleDto {
  @IsIn(['seeker', 'advisor'])
  role!: Extract<UserRole, 'seeker' | 'advisor'>;
}

class SetupProfileDto {
  @IsString()
  @Length(2, 50)
  username!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  bio?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const full = await this.users.findById(user.id);
    if (!full) throw new NotFoundException('User not found');
    // Return only fields safe for the client
    const {
      id,
      phone,
      email,
      name,
      role,
      avatarUrl,
      isVerified,
      profileComplete,
      createdAt,
      faith,
    } = full;
    return {
      id,
      phone,
      email,
      name,
      role,
      avatarUrl,
      isVerified,
      profileComplete,
      createdAt,
      faith: faith ?? null,
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.users.updateProfile(user.id, dto);
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
    };
  }

  /**
   * Role-pick endpoint — called from the onboarding screen after the user
   * chooses Seeker or Advisor. Previously missing → frontend got 404 and
   * the onboarding flow hung.
   */
  @Patch('me/role')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRoleDto,
  ) {
    const updated = await this.users.updateRole(user.id, dto.role);
    return { id: updated.id, role: updated.role };
  }

  // ── Username endpoints ────────────────────────────────────────────────────

  @Get('username/check/:username')
  checkUsername(@Param('username') username: string) {
    return this.users.checkUsernameAvailable(username);
  }

  @Get('username/suggestions')
  suggestUsernames(@Query('base') base: string) {
    return this.users.suggestUsernames(base ?? 'user');
  }

  @Post('profile/setup')
  async setupProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetupProfileDto,
  ) {
    return this.users.setupProfile(user.id, dto);
  }

  @Get('search')
  async searchUsers(@Query('q') q: string, @Req() req: Request) {
    const me = (req as any).user?.id ?? '';
    return this.users.searchByUsernameOrName(q ?? '', me);
  }

  /**
   * GDPR / DPDP Act 2023 — Right to Erasure
   *
   * Anonymises all PII and soft-deletes the account. The caller's JWT remains
   * valid until it expires (access tokens are short-lived at 15 min), but all
   * refresh tokens are immediately revoked so no new access tokens can be
   * issued after this point.
   *
   * Rate-limited to 1 call per day per user to prevent accidental re-deletion
   * races from a buggy client retry loop.
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(UserThrottleGuard)
  @UserThrottle(1, 86_400, 'delete-account')   // max 1 deletion per 24 h
  async deleteMe(@CurrentUser() user: AuthenticatedUser) {
    await this.users.deleteAccount(user.id);
  }
}
