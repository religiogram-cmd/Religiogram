import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AnalyticsService } from './analytics.service';

/**
 * BullMQ identifiers for the analytics sweeper. Kept in one place so the
 * processor and scheduler can import the same constants — renaming one
 * without the other would silently break the repeatable job.
 */
export const ANALYTICS_CLEANUP_QUEUE = 'analytics-cleanup';
export const ANALYTICS_CLEANUP_JOB = 'sweep-old';

/**
 * Deletes events older than 30 days.
 *
 * Why BullMQ instead of @nestjs/schedule?
 *   - Multi-pod safety: `@Cron` would fire on every pod; BullMQ guarantees
 *     a repeatable job runs on exactly one worker at a time.
 *   - Retries + backoff on transient DB errors.
 *   - Job history visible in the queue dashboard for ops.
 *
 * Concurrency = 1 by design — a second parallel sweep would race the first
 * and waste DB work.
 */
@Processor(ANALYTICS_CLEANUP_QUEUE, { concurrency: 1 })
export class AnalyticsCleanerProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsCleanerProcessor.name);

  constructor(private readonly analytics: AnalyticsService) {
    super();
  }

  async process(job: Job): Promise<{ deleted: number; cutoffIso: string }> {
    this.logger.debug(`Running ${job.name} (job ${job.id})`);
    // 30-day retention is hardcoded on purpose — see CITY_AND_ADMIN.md.
    // When we wire a warehouse ETL that pulls this table into S3/Snowflake,
    // this retention can shrink further (7–14 d) since long-term history
    // moves out of OLTP.
    return this.analytics.sweepOld(30);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Analytics sweep job ${job.id} failed: ${err.message}. BullMQ will retry.`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(
    job: Job,
    result: { deleted: number; cutoffIso: string },
  ): void {
    if (result.deleted > 0) {
      this.logger.log(
        `Analytics sweep removed ${result.deleted} rows older than ${result.cutoffIso}`,
      );
    }
  }
}
