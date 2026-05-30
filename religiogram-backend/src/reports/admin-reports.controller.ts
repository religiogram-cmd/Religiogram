import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { ReviewReportDto } from './dto/review-report.dto';
import type { ReportStatus, ReportTargetType } from './entities/content-report.entity';
import { ReportsService } from './reports.service';

/**
 * Admin moderation surface.
 *
 *   GET   /admin/reports?status=pending         → review queue
 *   PATCH /admin/reports/:id/review             → approve / reject
 *   POST  /admin/reports/unhide                 → undo a previous hide
 *                                                 { targetType, targetId }
 *
 * Gated by @Roles('admin'). Report queue defaults to `pending`.
 */
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('admin/reports')
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const valid: ReportStatus[] = ['pending', 'reviewed', 'rejected'];
    const typed = valid.includes(status as ReportStatus)
      ? (status as ReportStatus)
      : 'pending';
    const parsedLimit = limit ? Math.max(1, Math.min(500, Number(limit) || 200)) : 200;
    return this.reports.listForAdmin(typed, parsedLimit);
  }

  @Patch('admin/reports/:id/review')
  review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewReportDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.reports.review(id, admin.id, dto);
  }

  /**
   * Admin escape hatch: un-hide a previously hidden event or service.
   * Used when a prior "approve" turns out to have been a mistake or
   * when the owner successfully appeals.
   */
  @Post('admin/reports/unhide')
  unhide(@Body() body: { targetType: ReportTargetType; targetId: string }) {
    return this.reports.unhide(body.targetType, body.targetId);
  }
}
