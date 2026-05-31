import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VERSION_NEUTRAL, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { ALL_QUEUES } from '../common/queues/queue.constants';
import { KafkaProducerService } from '../events/kafka-producer.service';
import { ProviderIndexService } from '../opensearch/provider-index.service';

/**
 * Health endpoints for the load balancer and uptime monitors.
 *
 *   GET /v1/health        -> liveness  â€” process is alive (no I/O)
 *   GET /v1/health/ready  -> readiness â€” DB + Redis reachable, circuits checked
 *
 * Liveness failing -> restart the container.
 * Readiness failing -> drain traffic WITHOUT restarting.
 *
 * Both are @Public â€” no JWT required so probes work without credentials.
 */
@Controller({ path: 'health', version: ['1', VERSION_NEUTRAL] })
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly cb: CircuitBreakerService,
    private readonly kafka: KafkaProducerService,
    @Optional() private readonly osearch?: ProviderIndexService,
  ) {}

  /** Liveness â€” cheap no-I/O check. Used by K8s/ECS to decide restart. */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; pid: number; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness â€” pings DB and Redis; returns 503 if either is down.
   * Also exposes circuit-breaker states, memory stats, and BullMQ queue depths.
   *
   * Queue depths surface:
   *   waiting  â€” jobs queued but not yet picked up by a worker
   *   failed   â€” jobs that exhausted all retries (DLQ candidates)
   *
   * These counts are read directly from Redis key-length checks (LLEN /
   * ZCARD) so they add only 1 pipelined round-trip to the probe.
   */
  @Public()
  @Get('ready')
  async readiness(): Promise<{
    status: 'ok' | 'degraded';
    checks: { db: boolean; redis: boolean; kafka: boolean; opensearch: boolean };
    circuits: Record<string, string>;
    queues: Record<string, { waiting: number; failed: number }>;
    memory: { heapUsedMb: number; rssMb: number };
    uptime: number;
    timestamp: string;
  }> {
    const [dbOk, redisOk, queues, kafkaOk, osOk] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueues(),
      Promise.resolve(this.kafka.ping()),   // sync â€” no I/O; just returns this.connected
      this.checkOpenSearch(),
    ]);

    const mem = process.memoryUsage();
    const payload = {
      status: (dbOk && redisOk ? (kafkaOk && osOk ? 'ok' : 'degraded') : 'degraded') as 'ok' | 'degraded',
      checks: { db: dbOk, redis: redisOk, kafka: kafkaOk, opensearch: osOk },
      circuits: this.cb.status() as Record<string, string>,
      queues,
      memory: {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        rssMb: Math.round(mem.rss / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  /**
   * Read BullMQ waiting + failed counts for all known queues.
   *
   * BullMQ stores:
   *   Waiting jobs  -> ZSET  {prefix}:{queue}:wait
   *   Failed jobs   -> ZSET  {prefix}:{queue}:failed
   *
   * We use ZCARD (O(1)) via a single pipeline â€” one round-trip for all queues.
   * Falls back to zeros on any Redis error so the health probe never 503s
   * purely because of a transient queue-stats hiccup.
   */
  private async checkQueues(): Promise<Record<string, { waiting: number; failed: number }>> {
    try {
      const client = this.redis.getClient();
      const pipe = client.pipeline();
      const prefix = 'rg:bull';

      for (const q of ALL_QUEUES) {
        pipe.zcard(`${prefix}:${q}:wait`);
        pipe.zcard(`${prefix}:${q}:failed`);
      }

      const results = await pipe.exec();
      const out: Record<string, { waiting: number; failed: number }> = {};

      ALL_QUEUES.forEach((q, i) => {
        const waiting = (results?.[i * 2]?.[1] as number) ?? 0;
        const failed  = (results?.[i * 2 + 1]?.[1] as number) ?? 0;
        out[q] = { waiting, failed };
      });

      return out;
    } catch {
      // Don't let queue-stat failures take down the readiness probe
      return Object.fromEntries(ALL_QUEUES.map((q) => [q, { waiting: 0, failed: 0 }]));
    }
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    return this.redis.ping();
  }

  /**
   * Pings OpenSearch cluster health endpoint (3 s timeout).
   * Returns false if OS is unreachable â€” flagged as 'degraded' but does NOT
   * cause a 503 (so the pod stays in the load balancer).
   */
  private async checkOpenSearch(): Promise<boolean> {
    return this.osearch?.ping() ?? Promise.resolve(false);
  }
}

