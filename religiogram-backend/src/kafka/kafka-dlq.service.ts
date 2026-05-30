import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

/** TTL for Kafka DLQ payloads in Redis — 7 days (matching BullMQ DLQ TTL). */
const KAFKA_DLQ_TTL_SEC = 7 * 24 * 3_600;

/**
 * KafkaDlqService — dead-letter queue handler for failed Kafka messages.
 *
 * When a Kafka consumer processor exhausts its retry budget, it calls
 * `sendToDlq`. The failed message envelope is persisted to Redis under
 * `rg:dlq:kafka:{topic}:{ts}` with a 7-day TTL, matching the BullMQ DLQ
 * pattern used by DlqService. This lets admin operators replay or inspect
 * stuck messages via the existing DLQ admin endpoints.
 */
@Injectable()
export class KafkaDlqService {
  private readonly logger = new Logger(KafkaDlqService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Route a failed message to its DLQ topic and persist to Redis.
   *
   * @param originalTopic  The topic the message was originally consumed from.
   * @param message        The raw message value (object or Buffer/string).
   * @param error          The error that caused the final failure.
   */
  async sendToDlq(
    originalTopic: string,
    message: unknown,
    error: Error,
  ): Promise<void> {
    const dlqTopic = `${originalTopic}.dlq`;
    const key = `rg:dlq:kafka:${originalTopic}:${Date.now()}`;
    try {
      const preview = JSON.stringify(message).slice(0, 2_000);
      const envelope = JSON.stringify({
        originalTopic,
        dlqTopic,
        failedAt: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        payload: preview,
      });

      // Persist to Redis with TTL — inspectable via SCAN rg:dlq:kafka:*
      await this.redis.getClient().set(key, envelope, 'EX', KAFKA_DLQ_TTL_SEC);

      this.logger.error(
        `[KafkaDLQ] topic=${dlqTopic} redisKey=${key} error=${error.message}`,
        { originalTopic, dlqTopic, payloadPreview: preview.slice(0, 200) },
      );
    } catch (dlqErr) {
      this.logger.error(
        `[KafkaDLQ] Failed to persist DLQ entry for topic=${dlqTopic}: ${(dlqErr as Error).message}`,
      );
    }
  }
}
