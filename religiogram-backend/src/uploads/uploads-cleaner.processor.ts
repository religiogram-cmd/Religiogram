import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { UploadsService } from './uploads.service';

/**
 * BullMQ queue name for the sweeper. Kept as a const so the scheduler
 * (uploads-cleaner.service.ts) and the processor stay in sync — renaming
 * in one place without the other would silently break the job.
 */
export const UPLOADS_CLEANUP_QUEUE = 'uploads-cleanup';
export const UPLOADS_CLEANUP_JOB = 'sweep-expired';

/**
 * Worker that actually runs the sweep.
 *
 * Why BullMQ instead of @nestjs/schedule?
 *   - With 2+ API pods, `@Cron` would fire on every pod simultaneously.
 *     BullMQ guarantees a repeatable job runs on exactly one worker.
 *   - Free retries + backoff if a sweep fails (network blip to S3).
 *   - Job history is visible in the queue dashboard for ops.
 *
 * Concurrency = 1 on purpose: only one sweep running at a time. A second
 * concurrent sweep would race to delete the same rows and hit "affected
 * 0 rows" warnings (harmless but noisy).
 */
@Processor(UPLOADS_CLEANUP_QUEUE, { concurrency: 1 })
export class UploadsCleanerProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadsCleanerProcessor.name);

  constructor(private readonly uploads: UploadsService) {
    super();
  }

  async process(job: Job): Promise<{ rowsFound: number; s3Deleted: number; dbDeleted: number }> {
    this.logger.debug(`Running ${job.name} (job ${job.id})`);
    return this.uploads.sweepExpired();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    // Don't stack-trace here — sweepExpired already logs per-batch errors
    // and never throws. This path is for catastrophic worker failure.
    this.logger.error(
      `Sweep job ${job.id} failed: ${err.message}. BullMQ will retry.`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: { rowsFound: number; dbDeleted: number }): void {
    if (result.rowsFound > 0) {
      this.logger.log(
        `Sweep completed: cleaned ${result.dbDeleted}/${result.rowsFound} expired uploads`,
      );
    }
  }
}
