import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Public } from '../auth/decorators/public.decorator';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { Throttle } from '@nestjs/throttler';
import { EventRemindersService } from './event-reminders.service';

interface SubscribeBody {
  /** Lead time in minutes before event.startTime. Default 60. */
  leadMinutes?: number;
}

/**
 * Event reminders + add-to-calendar.
 *
 * Engagement endpoints (auth required):
 *   POST   /places/:id/events/:eventId/remind     → subscribe
 *   DELETE /places/:id/events/:eventId/remind     → unsubscribe
 *   GET    /me/reminders                          → my list
 *
 * Add-to-calendar (public, cacheable):
 *   GET    /places/:id/events/:eventId/ics        → downloadable .ics
 *
 * The ICS endpoint is deliberately @Public() so it works when tapped
 * from a share link (user may not be signed in on the device opening
 * the link). No personal data in the file.
 */
@Controller({ version: '1' })
export class EventRemindersController {
  constructor(private readonly reminders: EventRemindersService) {}

  @Post('places/:id/events/:eventId/remind')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  subscribe(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: SubscribeBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reminders.subscribe(id, eventId, user.id, body?.leadMinutes);
  }

  @Delete('places/:id/events/:eventId/remind')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  unsubscribe(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // `id` (the place id) is passed so the service can verify the event
    // actually belongs to this place before we flip a reminder — stops
    // any client from mutating a reminder via a wrong-but-valid place id
    // in the URL path.
    return this.reminders.unsubscribe(id, eventId, user.id);
  }

  @Get('me/reminders')
  @UseGuards(JwtAuthGuard, UserThrottlerGuard)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.reminders.listMine(user.id);
  }

  /**
   * Returns an .ics file with Content-Disposition: attachment so the
   * browser / mobile OS routes it to the default calendar app.
   */
  @Get('places/:id/events/:eventId/ics')
  @Public()
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async ics(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, body } = await this.reminders.getIcs(id, eventId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // 10 min edge cache — the event's start/end rarely change, and a
    // stale entry is a low-cost annoyance (user re-adds).
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(body);
  }
}
