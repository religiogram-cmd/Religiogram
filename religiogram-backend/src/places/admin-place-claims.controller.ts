import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { ReviewPlaceClaimDto } from './dto/review-place-claim.dto';
import { PlaceClaimsService } from './place-claims.service';
import type { ClaimStatus } from './entities/place-claim.entity';

/**
 * Admin review queue for place claims.
 *
 *   GET  /admin/claims?status=pending       → review queue (default: pending)
 *   POST /admin/claims/:claimId/approve     → approve + flip ownership
 *   POST /admin/claims/:claimId/reject      → reject with admin notes
 *   POST /admin/places/:id/transfer-owner   → direct owner assignment,
 *                                             bypasses the claim flow
 *
 * All routes are gated by `@Roles('admin')`.
 */
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPlaceClaimsController {
  constructor(private readonly claims: PlaceClaimsService) {}

  @Get('admin/claims')
  list(@Query('status') status?: string) {
    const valid: ClaimStatus[] = ['pending', 'approved', 'rejected', 'withdrawn'];
    const typed = valid.includes(status as ClaimStatus)
      ? (status as ClaimStatus)
      : 'pending';
    return this.claims.listForAdmin(typed);
  }

  @Post('admin/claims/:claimId/approve')
  approve(
    @Param('claimId', new ParseUUIDPipe({ version: '4' })) claimId: string,
    @Body() dto: ReviewPlaceClaimDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.claims.approve(claimId, admin.id, dto);
  }

  @Post('admin/claims/:claimId/reject')
  reject(
    @Param('claimId', new ParseUUIDPipe({ version: '4' })) claimId: string,
    @Body() dto: ReviewPlaceClaimDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.claims.reject(claimId, admin.id, dto);
  }

  /**
   * Admin-only "just set the owner" shortcut. Useful when we know the
   * custodian offline and don't want to ask them to submit a claim.
   * Body: { userId: string | null }  (null clears ownership).
   */
  @Post('admin/places/:id/transfer-owner')
  async transferOwner(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: { userId: string | null },
  ) {
    await this.claims.setOwner(id, body?.userId ?? null);
    return { success: true, placeId: id, ownerId: body?.userId ?? null };
  }
}
