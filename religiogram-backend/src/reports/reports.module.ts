import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacesModule } from '../places/places.module';
import { PlaceEvent } from '../places/entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from '../places/entities/place-service.entity';
import { AdminReportsController } from './admin-reports.controller';
import { ContentReport } from './entities/content-report.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports module.
 *
 * Ties together:
 *   - content_reports (entity ContentReport) — the workflow table
 *   - place_events / place_services — both read (for validation + admin
 *     target preview) and written (for the `is_hidden` flip on approve)
 *   - PlacesModule — re-used for PlacesService.bustCaches(), so approved
 *     reports eagerly invalidate the public profile cache
 *
 * We import PlacesModule (not TypeORM.forFeature(Temple) directly) to
 * avoid re-defining the places cache surface in two places — there's
 * a single bustCaches() and it lives inside PlacesService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentReport, PlaceEvent, PlaceServiceEntity]),
    PlacesModule,
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
