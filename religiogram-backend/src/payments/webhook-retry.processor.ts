import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { TracedWorkerHost } from '../tracing/bullmq-otel';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE } from '../common/queues/queue.constants';
import { PaymentsService } from './payments.service';

/**
 * WebhookRetryProcessor — manual DLQ replay for Razorpay webhook events
 *
 * Purpose:
 *   When a Razorpay webhook job exhausts all automatic retries in the primary
 *   `payment-webhook` queue it ends up in the DLQ (persisted in Redis under
 *   `rg:dlq:payment-webhook:{jobId}`).
 *
 *   Ops can inspect the DLQ via the admin panel and trigger a replay:
 *     POST /admin/payments/webhooks/replay
 *     { "event": "payment.captured", "payload": {...}, "eventId": "evt_xxx" }
 *
 *   The admin controller enqueues to the `webhook-retry` queue which is
 *   consumed here. The processor delegates to the same
 *   `PaymentsService.processWebhookEvent()` so business logic lives in one place.
 *
 * Concurrency = 1:
 *   Replay jobs are low-frequency admin operations; we run single-threaded to
 *   ensure idempotency checks in the service are never racing themselves.
 */

export interface WebhookRetryJobData {
  event:    string;
  payload:  Record<string, unknown>;
  eventId?: string;
  /** Original job ID from the primary queue — preserved for audit */
  originalJobId?: string;
}

@Processor(QUEUE.WEBHOOK_RETRY, { concurrency: 1 })
export class WebhookRetryProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(WebhookRetryProcessor.name);

  constructor(private readonly paymentsService: PaymentsService) {
    super();
  }

  protected async tracedProcess(job: Job<WebhookRetryJobData>): Promise<void> {
    const { event, payload, eventId, originalJobId } = job.data;

    this.logger.log(
      `Replaying webhook event="${event}" eventId=${eventId ?? 'n/a'} ` +
      `originalJobId=${originalJobId ?? 'n/a'} retryJobId=${job.id}`,
    );

    await this.paymentsService.processWebhookEvent(event, payload, eventId);

    this.logger.log(
      `Webhook replay succeeded: event="${event}" retryJobId=${job.id}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookRetryJobData>, err: Error): void {
    this.logger.error(
      `Webhook replay job ${job.id} (event: ${job.data.event}) ` +
      `failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }
}
