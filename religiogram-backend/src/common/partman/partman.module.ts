import { Module } from '@nestjs/common';
import { PartmanService } from './partman.service';

/**
 * PartmanModule — exports PartmanService so AdminController can call
 * POST /admin/partman/run to manually trigger partition creation.
 *
 * ScheduleModule must be imported in AppModule (already done via
 * ScheduleModule.forRoot()) for the @Cron decorator to activate.
 */
@Module({
  providers: [PartmanService],
  exports: [PartmanService],
})
export class PartmanModule {}
