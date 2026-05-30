import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { RedisService } from '../../redis/redis.service';
import { AlertsService } from '../alerts/alerts.service';
import { ALL_QUEUES } from './queue.constants';

/** TTL for DLQ payloads in Redis — 7 days (enough for a post-mortem window). */
const DLQ_TTL_SEC = 7 * 24 * 3_600;

/**
 * DlqService — global dead-letter queue subscriber
 *
 * How it works:
 *   For each queue in ALL_QUEUES, a BullMQ `QueueEvents` listener is created.
 *   When BullMQ moves a job to its internal failed state (after exhausting all
 *   retry attempts), the `failed` event fires here.
 *
 *   On failure:
 *     1. Capture the error to Sentry with queue + job context.
 *     2. Fire an ops alert so on-call engineers are notified.
 *     3. Persist the job payload in Redis under `rg:dlq:{queue}:{jobId}` with
 *        a 7-day TTL so the job can be replayed or inspected manually.
 *
 * Why QueueEvents instead of a Worker?
 *   `QueueEvents` is a lightweight pub/sub listener that does NOT consume jobs
 *   from the queue — it only subscribes to job lifecycle events emitted on a
 *   separate Redis Pub/Sub channel. This means:
 *     • No risk of accidentally processing a job twice
 *     • Works even when there is no active worker for a queue (e.g. during
 *       a deploy, when the queue processor pod has been terminated)
 *     • One DlqService instance covers ALL queues regardless of concurrency
 */
@Injectable()
export class DlqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqService.name);
  private readonly listeners: QueueEvents[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly alerts: AlertsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = this.buildRedisConnection();

    for (const queueName of ALL_QUEUES) {
      const qe = new QueueEvents(queueName, {
        connection,
        prefix: 'rg:bull',
      });

      qe.on('failed', async ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        await this.handleFailed(queueName, jobId, failedReason);
      });

      // QueueEvents also exposes 'error' — log it but don't crash
      qe.on('error', (err: Error) => {
        this.logger.error(`QueueEvents error on queue "${queueName}": ${err.message}`);
      });

      this.listeners.push(qe);
    }

    this.logger.log(
      `DLQ subscriber active on ${ALL_QUEUES.length} queues: ${ALL_QUEUES.join(', ')}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.listeners.map((qe) => qe.close()));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async handleFailed(
    queueName: string,
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    this.logger.error(
      `Job permanently failed — queue="${queueName}" jobId="${jobId}" reason="${failedReason}"`,
    );

    // 1. Capture to Sentry
    Sentry.captureException(new Error(`BullMQ job failed: ${failedReason}`), {
      tags: { queue: queueName, jobId },
      extra: { failedReason },
    });

    // 2. Ops alert
    void this.alerts.fire({
      channel: 'dlq_job_failed',
      severity: 'error',
      message: `BullMQ job exhausted all retries — manual intervention may be needed`,
      context: { queue: queueName, jobId, failedReason },
    });

    // 3. Persist in Redis DLQ key for post-mortem / manual replay
    const dlqKey = `dlq:${queueName}:${jobId}`;
    await this.redis.setEx(
      dlqKey,
      DLQ_TTL_SEC,
      JSON.stringify({
        queue:        queueName,
        jobId,
        failedReason,
        recordedAt:   new Date().toISOString(),
      }),
    ).catch((err: Error) =>
      this.logger.error(`Failed to persist DLQ entry: ${err.message}`),
    );
  }

  private buildRedisConnection() {
    const sentinelHosts = this.config.get<string>('redis.sentinelHosts');
    const password       = this.config.get<string>('redis.password');
    const tls            = this.config.get<boolean>('redis.tls', false);

    if (sentinelHosts) {
      const sentinels = sentinelHosts.split(',').map((h) => {
        const [host, portStr] = h.trim().split(':');
        return { host, port: parseInt(portStr ?? '26379', 10) };
      });
      return {
        sentinels,
        name:             this.config.get<string>('redis.sentinelName', 'mymaster'),
        password,
        tls:              tls ? {} : undefined,
        sentinelPassword: this.config.get<string>('redis.sentinelPassword'),
      } as any;
    }

    return {
      host:     this.config.getOrThrow<string>('redis.host'),
      port:     this.config.get<number>('redis.port', 6379),
      password,
      tls:      tls ? {} : undefined,
    };
  }
}
