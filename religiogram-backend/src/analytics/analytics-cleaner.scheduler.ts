import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  ANALYTICS_CLEANUP_JOB,
  ANALYTICS_CLEANUP_QUEUE,
} from './analytics-cleaner.processor';

/**
 * Schedules the analytics sweep once on bootstrap.
 *
 * A daily interval strikes the right balance for a 30-day retention window:
 *   - Too frequent (e.g. hourly) → wasted work; the table barely grows in
 *     an hour.
 *   - Too infrequent (e.g. weekly) → a backlog of ~350K rows piles up at
 *     10K DAU, making the sweep itself slow.
 *
 * Once daily is also friendly to Postgres maintenance — DELETE-heavy work
 * followed by an autovacuum is a known-good pattern.
 *
 * BullMQ de-duplicates repeat jobs by `jobId`, so multiple pods booting
 * together converge on exactly one scheduled job.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

@Injectable()
export class AnalyticsCleanerScheduler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsCleanerScheduler.name);

  constructor(
    @InjectQueue(ANALYTICS_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      ANALYTICS_CLEANUP_JOB,
      {},
      {
        jobId: 'analytics-cleanup-repeatable',
        repeat: { every: SWEEP_INTERVAL_MS },
        removeOnComplete: { count: 30 }, // keep a month of successful runs
        removeOnFail: { count: 50 },
      },
    );
    this.logger.log(
      `Scheduled analytics sweep every ${SWEEP_INTERVAL_MS / 1000 / 3600}h`,
    );
  }
}
