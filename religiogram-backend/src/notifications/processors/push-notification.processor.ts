import { Processor, WorkerHost } from '@nestjs/bullmq';
import { TracedWorkerHost } from '../../tracing/bullmq-otel';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications.service';
import {
  PUSH_NOTIFICATION_QUEUE,
  PUSH_JOB,
  type SendSinglePushJobData,
  type SendBatchPushJobData,
  type SendMulticastPushJobData,
} from '../push-notification.queue';

/**
 * BullMQ worker for FCM push delivery.
 *
 * Why async / off-thread?
 *   FCM calls add 100–500ms latency. Processing them inline on the request
 *   thread would slow every API response that triggers a notification.
 *   The queue decouples delivery from the write path entirely.
 *
 * Retry strategy:
 *   3 attempts with exponential backoff (5s, 10s, 20s).
 *   FCM is idempotent — retrying a failed send is safe.
 *
 * Concurrency:
 *   Default 10 — each FCM multicast covers up to 500 tokens so 10 concurrent
 *   jobs = 5000 token deliveries in parallel, sufficient for initial scale.
 *   Raise via PUSH_PROCESSOR_CONCURRENCY env var without code changes.
 *
 * P2-2: SEND_MULTICAST jobs carry pre-resolved token arrays (≤500 each).
 *   Token lookup and chunking happen in sendBatch() before enqueueing, so
 *   each job here represents exactly one FCM sendEachForMulticast call —
 *   making jobs atomic and retries cheap.
 */
@Processor(PUSH_NOTIFICATION_QUEUE, {
  concurrency: parseInt(process.env.PUSH_PROCESSOR_CONCURRENCY ?? '10', 10),
})
export class PushNotificationProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  protected async tracedProcess(
    job: Job<SendSinglePushJobData | SendBatchPushJobData | SendMulticastPushJobData>,
  ): Promise<void> {
    const { name, data: jobData } = job;

    try {
      if (name === PUSH_JOB.SEND_SINGLE) {
        const { userId, title, body, data: extraData } =
          jobData as SendSinglePushJobData;
        await this.notificationsService.sendPushToUser(
          userId,
          title,
          body,
          extraData,
        );
      } else if (name === PUSH_JOB.SEND_BATCH) {
        const { userIds, title, body, data: extraData } =
          jobData as SendBatchPushJobData;
        await this.notificationsService.sendPushToUsers(
          userIds,
          title,
          body,
          extraData,
        );
      } else if (name === PUSH_JOB.SEND_MULTICAST) {
        // P2-2: tokens already resolved + chunked — direct FCM call, no DB lookup
        const { tokens, title, body, data: extraData } =
          jobData as SendMulticastPushJobData;
        await this.notificationsService.sendMulticastTokens(
          tokens,
          title,
          body,
          extraData,
        );
      } else {
        this.logger.warn(`Unknown push job name: ${name}`);
      }
    } catch (err) {
      this.logger.error(
        `Push job failed (attempt ${job.attemptsMade + 1}): ${(err as Error).message}`,
      );
      throw err; // re-throw so BullMQ retries
    }
  }
}
