/**
 * Shared BullMQ default job options.
 *
 * Applied to every job via queue.add(name, data, jobOptions()).
 * Individual queues can override specific keys.
 *
 * Key decisions:
 *   - attempts: 4 — covers transient network glitches + 1 final attempt
 *   - backoff: exponential starting at 2s → 4s → 8s → 16s
 *   - removeOnComplete: { count: 1000 } — keep last 1000 completed jobs
 *   - removeOnFail: { age: 7 * 24 * 3600 } — dead-letter queue, 7-day retention
 *   - timeout: 30_000 — abort stuck jobs after 30s
 */
export function defaultJobOptions(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attempts: 4,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { age: 7 * 24 * 3_600 },
    timeout: 30_000,
    ...overrides,
  };
}
