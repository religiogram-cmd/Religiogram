import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE } from '../common/queues/queue.constants';

/**
 * Schedules the hourly story-expiry cleanup job on bootstrap.
 *
 * Stories have a 24-hour TTL (set at creation time in StoryService). Without
 * a cleanup job the rows accumulate indefinitely. Running hourly keeps the
 * table size bounded — worst case a story lives 1 hour past its expiresAt.
 *
 * BullMQ de-duplicates repeat jobs by `jobId`, so multiple pods booting
 * together converge on exactly one scheduled job.
 */
@Injectable()
export class StoryExpiryScheduler implements OnModuleInit {
  private readonly logger = new Logger(StoryExpiryScheduler.name);

  constructor(
    @InjectQueue(QUEUE.STORY_EXPIRY) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Runs hourly — delete expired stories
    await this.queue.add(
      'cleanup',
      {},
      {
        jobId: 'story-expiry-hourly',
        repeat: { pattern: '0 * * * *' },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
    this.logger.log('Scheduled story-expiry cleanup (hourly)');
  }
}
