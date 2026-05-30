import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { TracedWorkerHost } from '../tracing/bullmq-otel';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  PaymentsService,
  PAYMENT_WEBHOOK_QUEUE,
  WEBHOOK_JOB_PROCESS,
} from './payments.service';

interface WebhookJobData {
  event: string;
  payload: Record<string, unknown>;
  eventId?: string;
  /** v9: forensic-correct raw-body sha threaded from handleWebhook(). */
  bodySha256?: string;
}

/**
 * Processes Razorpay webhook events from the BullMQ queue.
 *
 * Running this async means:
 *  1. We return 200 to Razorpay instantly (preventing retries from slow DB).
 *  2. BullMQ handles retries with exponential backoff on transient failures.
 *  3. Failed jobs are kept 7 days for ops investigation.
 *
 * Concurrency = 3: webhook events are idempotent (payment status checks)
 * so parallel workers are safe and improve throughput under traffic spikes.
 */
@Processor(PAYMENT_WEBHOOK_QUEUE, { concurrency: 3 })
export class PaymentWebhookProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(PaymentWebhookProcessor.name);

  constructor(private readonly paymentsService: PaymentsService) {
    super();
  }

  protected async tracedProcess(job: Job<WebhookJobData>): Promise<void> {
    if (job.name !== WEBHOOK_JOB_PROCESS) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }
    const { event, payload, eventId, bodySha256 } = job.data;
    this.logger.debug(
      `Processing webhook event "${event}" (id=${eventId} job ${job.id}, attempt ${job.attemptsMade + 1})`,
    );
    await this.paymentsService.processWebhookEvent(event, payload, eventId, bodySha256);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData>, err: Error): void {
    this.logger.error(
      `Webhook job ${job.id} (event: ${job.data.event}) failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<WebhookJobData>): void {
    this.logger.debug(
      `Webhook job ${job.id} (event: ${job.data.event}) completed`,
    );
  }
}
