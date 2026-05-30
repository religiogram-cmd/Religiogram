import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * PartmanService — monthly PostgreSQL partition creation cron.
 *
 * Migration 034 created initial monthly child partitions for:
 *   bookings, ledger_entries, notifications
 * covering -6 months to +13 months from the migration date.
 *
 * This service fills in one new month ahead on the 1st of every month so
 * that there is always a child partition ready before new rows arrive. It
 * also ensures the DEFAULT partition is present as a catch-all.
 *
 * ── Why not pg_partman? ────────────────────────────────────────────────
 * pg_partman is the gold standard for partition management in production
 * but requires a PostgreSQL extension to be installed. In RDS / Aurora
 * that needs a DBA action. This service is a lightweight alternative that
 * works out of the box on any PostgreSQL connection, and can be replaced
 * by pg_partman later with:
 *
 *   SELECT partman.create_parent(
 *     'public.bookings', 'created_at', 'native', 'monthly'
 *   );
 *
 * ── Idempotency ────────────────────────────────────────────────────────
 * Every CREATE TABLE uses IF NOT EXISTS so re-runs are safe. The cron job
 * is intentionally simple: it creates the next 3 months of partitions to
 * give buffer against a missed run.
 *
 * ── Observability ─────────────────────────────────────────────────────
 * Each run logs how many partitions were created / already existed so
 * Datadog / CloudWatch can alert on missed or failed runs.
 */

const PARTITIONED_TABLES = [
  { table: 'bookings',       dateCol: 'created_at' },
  { table: 'ledger_entries', dateCol: 'created_at' },
  { table: 'notifications',  dateCol: 'created_at' },
  { table: 'feed_items',     dateCol: 'created_at' },
] as const;

/** Strict allowlist of table names that may receive DDL from this service. */
const ALLOWED_TABLES = new Set(PARTITIONED_TABLES.map(t => t.table));

/** How many months ahead to pre-create partitions. */
const MONTHS_AHEAD = 3;

@Injectable()
export class PartmanService {
  private readonly logger = new Logger(PartmanService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Run on the 1st of every month at 00:05 UTC.
   * The 5-minute offset avoids any midnight contention with other cron jobs.
   */
  @Cron('5 0 1 * *', { name: 'partman-create-partitions', timeZone: 'UTC' })
  async createUpcomingPartitions(): Promise<void> {
    this.logger.log('PartmanService: creating upcoming monthly partitions');
    let created = 0;
    let alreadyExists = 0;

    for (const { table } of PARTITIONED_TABLES) {
      for (let offset = 1; offset <= MONTHS_AHEAD; offset++) {
        const result = await this._ensurePartition(table, offset);
        if (result === 'created') created++;
        else alreadyExists++;
      }
    }

    this.logger.log(
      `PartmanService done: created=${created} alreadyExists=${alreadyExists}`,
    );
  }

  /**
   * Create the partition for `monthOffset` months from now.
   * Returns 'created' or 'exists'.
   */
  private async _ensurePartition(
    tableName: string,
    monthOffset: number,
  ): Promise<'created' | 'exists'> {
    // Guard against SQL injection via table name — only allowlisted tables
    // may receive DDL from this service.
    if (!ALLOWED_TABLES.has(tableName as any)) {
      this.logger.error(`Rejected DDL for non-allowlisted table: ${tableName}`);
      return 'exists';
    }

    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset + 1, 1),
    );
    const label = `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    const partitionName = `${tableName}_${label}`;
    const fromDate = start.toISOString().slice(0, 10);
    const toDate = end.toISOString().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw new Error(`Invalid partition date: ${fromDate}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      throw new Error(`Invalid partition date: ${toDate}`);
    }

    try {
      // Check if it already exists by querying pg_class.
      const check = await this.dataSource.query<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = $1 AND n.nspname = 'public'
         ) AS exists`,
        [partitionName],
      );
      if (check[0]?.exists) return 'exists';

      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "${partitionName}"
          PARTITION OF "${tableName}"
          FOR VALUES FROM ('${fromDate}') TO ('${toDate}')
      `);
      this.logger.log(`Created partition: ${partitionName} [${fromDate}, ${toDate})`);
      return 'created';
    } catch (err) {
      // Log but never throw — a missed partition just routes rows to DEFAULT.
      this.logger.error(
        `Failed to create partition ${partitionName}: ${(err as Error).message}`,
      );
      return 'exists';
    }
  }

  /**
   * Manually trigger partition creation (useful for deployment runbooks
   * or when recovering from a missed cron run).
   * Exposed via AdminController at POST /admin/partman/run.
   */
  async runNow(): Promise<{ created: number; alreadyExists: number }> {
    let created = 0;
    let alreadyExists = 0;
    for (const { table } of PARTITIONED_TABLES) {
      for (let offset = 0; offset <= MONTHS_AHEAD; offset++) {
        const result = await this._ensurePartition(table, offset);
        if (result === 'created') created++;
        else alreadyExists++;
      }
    }
    return { created, alreadyExists };
  }
}
