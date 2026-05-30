import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { Throttle } from '@nestjs/throttler';
import { CreatePlaceClaimDto } from './dto/create-place-claim.dto';
import { PlaceClaimsService } from './place-claims.service';

/**
 * User-facing claim endpoints. All require authentication.
 *
 *   POST   /places/:id/claim           → submit
 *   GET    /places/:id/claim/status    → my status on this place
 *   DELETE /places/:id/claim           → withdraw my pending claim
 *   GET    /me/claims                  → list my claims across all places
 *
 * Rate limit: 5 claims per user per hour. A legitimate custodian submits
 * one claim; this cap is tight enough to throttle anyone scripting
 * mass-claim attacks against a rival.
 */
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class PlaceClaimsController {
  constructor(private readonly claims: PlaceClaimsService) {}

  @Post('places/:id/claim')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  submit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreatePlaceClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.claims.submit(id, user.id, dto);
  }

  @Get('places/:id/claim/status')
  status(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.claims.myStatus(id, user.id);
  }

  @Delete('places/:id/claim')
  @HttpCode(200)
  withdraw(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.claims.withdraw(id, user.id);
  }

  @Get('me/claims')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.claims.listMine(user.id);
  }
}
