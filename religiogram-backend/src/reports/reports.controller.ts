import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

/**
 * User-facing report endpoint.
 *
 *   POST /api/v1/reports → submit a report
 *
 * Rate limit: 5 reports per user per hour. Generous enough for a
 * genuine cleanup run ("I noticed three dead events on my local
 * gurudwara's page"), tight enough to choke a bot trying to mass-flag
 * a rival's listings.
 *
 * The dedup UNIQUE INDEX in content_reports already guarantees that
 * the same user can't file ten reports on the same row — the throttle
 * here limits breadth (many targets), the index limits depth (same
 * target).
 */
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  submit(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.submit(user.id, dto);
  }
}
