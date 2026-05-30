import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

class SetWeeklySlotsDto {
  slots!: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}

class AddOverrideDto {
  date!: string;
  isBlocked!: boolean;
  reason?: string;
}

@ApiTags('availability')
@ApiBearerAuth()
@Controller({ path: 'availability', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /** POST /availability/slots — set weekly recurring slots (provider only) */
  @Post('slots')
  @Roles('advisor')
  setWeeklySlots(@Request() req: any, @Body() dto: SetWeeklySlotsDto) {
    return this.availabilityService.setWeeklySlots(
      req.user.providerId ?? req.user.id,
      dto.slots,
    );
  }

  /** POST /availability/overrides — add a date override (provider only) */
  @Post('overrides')
  @Roles('advisor')
  addOverride(@Request() req: any, @Body() dto: AddOverrideDto) {
    return this.availabilityService.addOverride(
      req.user.providerId ?? req.user.id,
      dto.date,
      dto.isBlocked,
      dto.reason,
    );
  }

  /** GET /availability/me — get my full schedule (provider only) */
  @Get('me')
  @Roles('advisor')
  getMySchedule(@Request() req: any) {
    return this.availabilityService.getMySchedule(
      req.user.providerId ?? req.user.id,
    );
  }

  /** GET /availability/provider/:providerId?date=YYYY-MM-DD — public */
  @Get('provider/:providerId')
  @Public()
  @ApiQuery({ name: 'date', required: true, example: '2025-06-01' })
  getAvailableSlots(
    @Param('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    return this.availabilityService.getAvailableSlots(providerId, date);
  }
}
