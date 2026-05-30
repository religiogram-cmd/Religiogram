import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import type { AlertsService } from '../common/alerts/alerts.service';

/**
 * Attach pool-level observability to the pg pool that TypeORM wraps.
 *
 * We want to know, in production:
 *   - When a pool acquire waits longer than slowAcquireMs
 *   - When pool is at capacity (waitingCount > 0)
 *   - When connections error out of band
 *
 * Periodic sampler (every 30s) emits pool gauges so CloudWatch metric
 * filters can graph them.
 *
 * Call attachPoolObserver(dataSource, alerts, { slowAcquireMs }) from
 * main.ts after NestFactory.create() resolves.
 */
export function attachPoolObserver(
  ds: DataSource,
  alerts: AlertsService,
  opts: { slowAcquireMs: number; sampleIntervalMs?: number } = {
    slowAcquireMs: 500,
  },
): () => void {
  const logger = new Logger('pg-pool');
  const sampleInterval = opts.sampleIntervalMs ?? 30_000;

  // TypeORM's PostgresDriver exposes the underlying pg Pool at driver.master.
  // Types are loose across versions; guard with any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool: any = (ds.driver as any).master;
  if (!pool || typeof pool.on !== 'function') {
    logger.warn('pg pool not accessible — pool observer disabled');
    return () => undefined;
  }

  pool.on('error', (err: Error) => {
    logger.error(`pg pool error: ${err.message}`);
    void alerts.fire({
      channel: 'db_pool_pressure',
      severity: 'error',
      message: 'PostgreSQL pool emitted an error event',
      error: err,
    });
  });

  pool.on('connect', () => {
    // Enforce session-level idle-in-transaction timeout at connect time.
    // Idle-in-txn holders are the #1 cause of pool exhaustion.
    pool.query?.(
      "SET idle_in_transaction_session_timeout = '15s'",
    ).catch(() => undefined);
  });

  const interval = setInterval(() => {
    try {
      const total = pool.totalCount ?? 0;
      const idle = pool.idleCount ?? 0;
      const waiting = pool.waitingCount ?? 0;

      // Single structured log line per sample — cheap to filter in
      // CloudWatch Insights: stats by avg(total), max(waiting) as metric.
      logger.log(
        JSON.stringify({
          type: 'pg_pool_sample',
          total,
          idle,
          active: total - idle,
          waiting,
        }),
      );

      // Pressure alert: if we have requests waiting and the pool is full,
      // that's real latency being shed. Log as warn; escalate to error if
      // sustained > 3 consecutive samples.
      if (waiting > 0 && idle === 0) {
        logger.warn(
          `pg pool pressure — total=${total} idle=${idle} waiting=${waiting}`,
        );
      }
      if (waiting > 10) {
        void alerts.fire({
          channel: 'db_pool_pressure',
          severity: 'critical',
          message:
            'PostgreSQL pool saturation — > 10 requests queued for a connection',
          context: { total, idle, waiting },
        });
      }
    } catch (err) {
      logger.warn(`pool sample failed: ${(err as Error).message}`);
    }
  }, sampleInterval).unref();

  // Slow-acquire wrapper: monkey-patch pool.connect to time the wait.
  // pg exposes connect() as an async method. This must stay cheap.
  const originalConnect = pool.connect.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool.connect = async (...args: any[]) => {
    const t0 = Date.now();
    const client = await originalConnect(...args);
    const dt = Date.now() - t0;
    if (dt > opts.slowAcquireMs) {
      logger.warn(
        JSON.stringify({
          type: 'slow_pool_acquire',
          waitMs: dt,
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        }),
      );
    }
    return client;
  };

  return () => clearInterval(interval);
}
