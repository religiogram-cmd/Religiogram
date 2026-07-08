import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { NotificationsService } from './notifications.service';
import { NotificationPrefs } from './entities/notification-prefs.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * PATCH body — every field optional. Callers only send the fields they
 * want to change; server preserves the rest. `null` on a DND field
 * clears the window.
 */
class UpdatePrefsDto {
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @IsOptional() @IsBoolean() marketingEnabled?: boolean;

  // ValidateIf ensures `null` is accepted as a legal value (clears DND);
  // when non-null it must be an integer in [0, 23].
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt() @Min(0) @Max(23)
  dndStartHour?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt() @Min(0) @Max(23)
  dndEndHour?: number | null;
}

/**
 * Notification preferences — per-user push/email/SMS/marketing toggles and
 * an optional Do-Not-Disturb window. Consumed by NotificationsService.send()
 * to gate FCM dispatch (see FIX B).
 */
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications/prefs', version: '1' })
export class NotificationPrefsController {
  constructor(private readonly notifs: NotificationsService) {}

  /**
   * GET /v1/notifications/prefs
   * Return the caller's notification prefs. If no row exists in DB, the
   * response is the default set (push/email/sms on, marketing off, no DND).
   */
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPrefs> {
    return this.notifs.getPrefs(user.id);
  }

  /**
   * PATCH /v1/notifications/prefs
   * Update the caller's notification prefs (upsert). Every field is optional;
   * server preserves any field not present in the body.
   */
  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePrefsDto,
  ): Promise<NotificationPrefs> {
    return this.notifs.updatePrefs(user.id, dto);
  }
}
