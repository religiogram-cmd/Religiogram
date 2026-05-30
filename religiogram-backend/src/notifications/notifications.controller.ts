import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications?cursor=ISO_TIMESTAMP&limit=20
   * Cursor-based paginated notification feed for the authenticated user.
   * Response: { items, nextCursor, unreadCount }
   */
  @Get()
  async getMyNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListNotificationsDto,
  ) {
    return this.notificationsService.getMyNotifications(
      user.id,
      dto.cursor,
      dto.limit,
    );
  }

  /**
   * GET /notifications/unread-count
   * Returns { count: number } — used by the BottomNav badge.
   * Intentionally placed BEFORE /:id routes to avoid param collision.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.notificationsService.countUnread(user.id);
    return { count };
  }

  /**
   * PATCH /notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markOneRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.notificationsService.markOneRead(user.id, id);
  }

  /**
   * PATCH /notifications/read
   * Body: { ids: ['uuid', ...] }
   * Mark specific notifications as read.
   */
  @Patch('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkReadDto,
  ) {
    await this.notificationsService.markRead(user.id, dto.ids);
  }

  /**
   * PATCH /notifications/read-all
   * Mark all of the user's unread notifications as read.
   */
  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllRead(user.id);
  }

  /**
   * POST /notifications/device-token
   * Register an FCM device token for push notifications.
   * Body: { token, platform }
   */
  @Post('device-token')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notificationsService.registerDevice(user.id, dto);
  }

  /**
   * DELETE /notifications/device-token/:token
   * Deactivate a device token (called on logout or explicit opt-out).
   */
  @Delete('device-token/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    await this.notificationsService.unregisterDevice(user.id, token);
  }
}
