import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  REMINDER_DISPATCH_JOB,
  REMINDER_DISPATCH_QUEUE,
} from './event-reminders.processor';

/**
 * Schedules the reminder dispatcher every minute.
 *
 * Why 1 minute?
 *   - The minimum granularity users will notice. We can't promise
 *     sub-minute delivery without per-reminder delayed jobs, and that's
 *     a scale anti-pattern once we're past thousands of subscriptions.
 *   - Keeps the scan cheap: at 1k scheduled rows per minute there are
 *     ~0 to a handful to dispatch in any single tick.
 *
 * BullMQ de-duplicates by `jobId`, so multiple pods booting together
 * converge on exactly one scheduled job.
 */
const SCAN_INTERVAL_MS = 60 * 1000;

@Injectable()
export class EventRemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(EventRemindersScheduler.name);

  constructor(
    @InjectQueue(REMINDER_DISPATCH_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      REMINDER_DISPATCH_JOB,
      {},
      {
        jobId: 'event-reminder-dispatch-repeatable',
        repeat: { every: SCAN_INTERVAL_MS },
        removeOnComplete: { count: 500 }, // ~8 hours of history
        removeOnFail: { count: 200 },
        attempts: 3, // transient DB / Redis errors retry with backoff
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    this.logger.log(
      `Scheduled reminder dispatch every ${SCAN_INTERVAL_MS / 1000}s`,
    );
  }
}
