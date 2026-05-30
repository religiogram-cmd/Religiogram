import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  UPLOADS_CLEANUP_JOB,
  UPLOADS_CLEANUP_QUEUE,
} from './uploads-cleaner.processor';

/**
 * Schedules the sweeper on bootstrap.
 *
 * `repeat.every` tells BullMQ to enqueue the job every N ms, and BullMQ
 * de-duplicates against the `jobId` so multiple pods booting together
 * don't schedule N copies. Net effect: exactly one sweep every 10 min,
 * no matter how many pods exist.
 *
 * If you want to change the interval, change this one constant — the
 * processor doesn't need touching.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 min

@Injectable()
export class UploadsCleanerScheduler implements OnModuleInit {
  private readonly logger = new Logger(UploadsCleanerScheduler.name);

  constructor(
    @InjectQueue(UPLOADS_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // `jobId` pins the repeatable job — subsequent calls are no-ops on
    // the same ID, so every pod's boot-time add() converges on one job.
    await this.queue.add(
      UPLOADS_CLEANUP_JOB,
      {},
      {
        jobId: 'uploads-cleanup-repeatable',
        repeat: { every: SWEEP_INTERVAL_MS },
        // Keep the last 10 sweep results for ops; anything older is noise.
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    );
    this.logger.log(
      `Scheduled upload sweeper every ${SWEEP_INTERVAL_MS / 1000}s`,
    );
  }
}
