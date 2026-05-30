import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PartmanService } from '../common/partman/partman.service';

/**
 * v6 (recovery): admin-ops.controller.ts was truncated in v3.
 * Reconstructed from the audited contract.
 */
@ApiTags('Admin / Ops')
@ApiBearerAuth()
@Controller({ path: 'admin/ops', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOpsController {
  constructor(private readonly partman: PartmanService) {}

  /**
   * POST /v1/admin/ops/partman/run
   *
   * Manually trigger the monthly partition creation job.
   */
  @Post('partman/run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually run pg_partman partition creation' })
  async runPartman(@CurrentUser() me: AuthenticatedUser) {
    const result = await this.partman.runNow();
    return { triggeredBy: me.id, ...result };
  }
}
