import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import {
  ANALYTICS_CLEANUP_QUEUE,
  AnalyticsCleanerProcessor,
} from './analytics-cleaner.processor';
import { AnalyticsCleanerScheduler } from './analytics-cleaner.scheduler';

/**
 * Analytics module — write-only event beacon + daily retention sweep.
 *
 * The sweep lives here (not in a separate "jobs" module) so the queue
 * name, processor, scheduler, and the service that knows how to delete
 * rows are all co-located. Keeps the DB-side retention contract obvious.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent]),
    // BullMQ queue for the 30-day sweeper. The Redis connection is already
    // configured app-wide in app.module.ts via BullModule.forRootAsync.
    BullModule.registerQueue({ name: ANALYTICS_CLEANUP_QUEUE }),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsCleanerProcessor,
    AnalyticsCleanerScheduler,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
