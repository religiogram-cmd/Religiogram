import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FraudService } from './fraud.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@Controller({ path: 'fraud', version: '1' })
@Roles('admin')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  /** GET /fraud/signals?userId=&resolved= */
  @Get('signals')
  getSignals(
    @Query('userId')   userId?: string,
    @Query('resolved') resolved?: string,
  ) {
    const resolvedBool =
      resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.fraudService.getSignals(userId, resolvedBool);
  }

  /** GET /fraud/high-risk */
  @Get('high-risk')
  getHighRiskUsers() {
    return this.fraudService.getHighRiskUsers();
  }

  /** POST /fraud/signals/:id/resolve */
  @Post('signals/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolveSignal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.fraudService.resolveSignal(id, admin.id);
  }
}
