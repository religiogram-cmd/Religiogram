import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { LogEventDto } from './dto/log-event.dto';
import { AnalyticsService } from './analytics.service';

/**
 * Event beacon — fire-and-forget analytics.
 *
 *   POST /api/v1/analytics/event
 *
 *   Body: { eventType, metadata?, clientTs? }
 *
 * Returns 202 Accepted so the client treats this as a best-effort
 * signal. Even if the DB write fails, the user's main flow is never
 * disturbed.
 *
 * Rate limit
 * ----------
 *   120 events / minute / user — enough for moderately-chatty clients
 *   (a typing session fires ~1/sec of debounced events + a few clicks)
 *   while still blocking a runaway loop or a malicious client.
 */
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Post('event')
  @HttpCode(202)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async event(
    @Body() dto: LogEventDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() req: Request,
  ): Promise<{ accepted: true }> {
    // JwtAuthGuard is global, so `user` is always populated in practice —
    // the null branch is here for the future anonymous case.
    await this.svc.record({
      dto,
      userId: user?.id ?? null,
      ip: this.extractIp(req),
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
    return { accepted: true };
  }

  /**
   * Prefer X-Forwarded-For (set by ALB / CloudFront), fall back to the
   * TCP remote address. We deliberately don't parse the whole XFF list
   * — we only want the originating client IP, which is the first token.
   */
  private extractIp(req: Request): string | null {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) {
      return xff.split(',')[0].trim();
    }
    if (Array.isArray(xff) && xff.length) {
      return xff[0];
    }
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }
}
