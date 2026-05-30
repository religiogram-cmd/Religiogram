import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PayoutService } from './payout.service';

@ApiTags('payout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'payout', version: '1' })
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get('earnings')
  @Roles('advisor')
  @ApiOperation({ summary: 'Get provider earnings history (provider)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getProviderEarnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.payoutService.getProviderEarnings(user.id, page, limit);
  }

  @Get('payouts')
  @Roles('advisor')
  @ApiOperation({ summary: 'Get provider payout batches (provider)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getProviderPayouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.payoutService.getProviderPayouts(user.id, page, limit);
  }

  @Get('pending')
  @Roles('advisor')
  @ApiOperation({ summary: 'Get pending earnings summary (provider)' })
  getPendingEarnings(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutService.getPendingEarnings(user.id);
  }

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @Roles('advisor')
  @ApiOperation({ summary: 'Schedule a payout batch for pending earnings (provider)' })
  scheduleBatch(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutService.scheduleBatch(user.id);
  }

  @Post('batches/:id/process')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Process a scheduled payout batch (admin)' })
  processBatch(@Param('id') id: string) {
    return this.payoutService.processBatch(id);
  }
}
