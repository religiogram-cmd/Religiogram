import { Processor, WorkerHost } from '@nestjs/bullmq';
import { TracedWorkerHost } from '../../tracing/bullmq-otel';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FeedService } from '../feed.service';
import { QUEUE } from '../../common/queues/queue.constants';

/**
 * FanOutJob payload — emitted by SocialService.createPost when the author has
 * more than FEED_ASYNC_FANOUT_THRESHOLD accepted friendships.
 */
export interface FanOutJobData {
  postId: string;
  authorId: string;
  /** ISO-8601 string — Date is not serializable in BullMQ JSON payloads. */
  postCreatedAt: string;
}

/**
 * FanOutProcessor — BullMQ worker for async feed fan-out.
 *
 * ── Why async? ──────────────────────────────────────────────────────────────
 * FeedService.fanOut() runs a single INSERT … SELECT that fans a post out to
 * all of the author's friends. For an average user (~200 friends) this takes
 * ~5–20 ms — completely acceptable on the HTTP hot path.
 *
 * For a "celebrity" user with 10 000 friends, the INSERT writes 10 000 rows
 * in a single query. At 10 000 rows × ~100 bytes = ~1 MB per insert, plus the
 * friendship scan, this can take 200–500 ms on the write path — unacceptable
 * for a POST /posts endpoint that should return in < 50 ms.
 *
 * The async path enqueues a FanOutJob in BullMQ; the processor calls
 * FeedService.fanOut() asynchronously. The HTTP response returns immediately
 * after the post is saved; the timeline updates within seconds via the queue.
 *
 * ── Feature flag ────────────────────────────────────────────────────────────
 * Gated by FF_ENABLE_ASYNC_FANOUT (default: false).
 * The threshold is configurable via FEED_ASYNC_FANOUT_THRESHOLD (default: 500).
 *
 * ── Retry / idempotency ─────────────────────────────────────────────────────
 * BullMQ retries on failure (4 attempts, exponential backoff).
 * FeedService.fanOut uses ON CONFLICT DO NOTHING — idempotent on re-runs.
 * Duplicate jobs (e.g. from a crash between enqueue and ACK) are safe.
 */
@Processor(QUEUE.FEED_FANOUT)
export class FanOutProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(FanOutProcessor.name);

  constructor(private readonly feed: FeedService) {
    super();
  }

  protected async tracedProcess(job: Job<FanOutJobData>): Promise<void> {
    const { postId, authorId, postCreatedAt } = job.data;

    this.logger.debug(
      `Processing fan-out job ${job.id}: post=${postId} author=${authorId}`,
    );

    await this.feed.fanOut(postId, authorId, new Date(postCreatedAt));

    this.logger.debug(`Fan-out job ${job.id} completed for post=${postId}`);
  }
}
