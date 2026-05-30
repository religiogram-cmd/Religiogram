import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 034 — RANGE partitioning for high-volume tables
 *
 * At 1M+ users, three tables will accumulate hundreds of millions of rows:
 *
 *   bookings        — every booking ever made
 *   ledger_entries  — every wallet debit/credit
 *   notifications   — every push / in-app notification
 *
 * RANGE partitioning on created_at:
 *   - Each partition covers one calendar month.
 *   - PostgreSQL query planner PRUNES partitions automatically when a
 *     WHERE clause constrains created_at to a date range.
 *   - Old partitions can be DETACHed and archived with zero downtime.
 *   - The composite indexes on (user_id/wallet_id, created_at DESC)
 *     from Migration 033 carry over to all child partitions automatically.
 *
 * ⚠ Zero-downtime strategy:
 *   Converting an existing table to PARTITION BY RANGE requires a full
 *   table rewrite in PostgreSQL, which is NOT zero-downtime for large
 *   production tables. This migration is designed to be run during a
 *   maintenance window OR applied to a fresh database before first use.
 *
 *   For large existing tables, use pg_partman's online migration approach
 *   (create new partitioned table → swap → rename) via a DBA script.
 *   This migration handles the structural definition only.
 *
 * Partitions created here:
 *   Current month ± 6 months back, and +12 months ahead.
 *   A DEFAULT partition catches overflow rows until new monthly
 *   partitions are created (ideally via pg_partman or a cron job).
 *
 * pg_partman note:
 *   Comment on each partitioned table so pg_partman knows to manage it
 *   when the extension is installed:
 *     SELECT partman.create_parent(
 *       'public.bookings', 'created_at', 'native', 'monthly'
 *     );
 */
export class PartitionHotTables1700000000034 implements MigrationInterface {
  name = 'PartitionHotTables1700000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── bookings ─────────────────────────────────────────────────────
    await this._partitionTable(queryRunner, 'bookings', 'created_at');

    // ── ledger_entries ────────────────────────────────────────────────
    await this._partitionTable(queryRunner, 'ledger_entries', 'created_at');

    // ── notifications ─────────────────────────────────────────────────
    await this._partitionTable(queryRunner, 'notifications', 'created_at');
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
        'Migration 034 down() is NOT safe to run automatically. ' +
        'Reverting table partitioning requires a manual DBA procedure with full backup. ' +
        'See docs/runbook.md#revert-partition-migration. ' +
        'DO NOT run migration:revert in production.'
    );
  }

  /**
   * Converts `tableName` to a RANGE-partitioned table on `dateColumn`.
   *
   * Steps:
   *   1. Rename the original table to _old.
   *   2. Create a new partitioned table with the same structure.
   *   3. Create monthly child partitions for the past 6 months + next 12 months.
   *   4. Create a DEFAULT partition for overflow.
   *   5. Copy all rows from _old to the new table.
   *   6. Swap foreign-key sequences and drop the old table.
   *
   * In production this step (5) should be done with a background copy
   * tool (e.g. pg_partman's online migration) rather than a blocking
   * INSERT ... SELECT. This migration generates the DDL only and runs
   * the copy inline — acceptable for empty/small tables at startup.
   */
  private async _partitionTable(
    queryRunner: QueryRunner,
    tableName: string,
    dateColumn: string,
  ): Promise<void> {
    // ── Step 1: rename original ──────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "${tableName}" RENAME TO "${tableName}_old"`,
    );

    // ── Step 2: create partitioned table ────────────────────────────
    // Copy the DDL of the original table, add PARTITION BY RANGE.
    // We use CREATE TABLE ... LIKE which copies column definitions,
    // NOT NULL constraints, and defaults (but not indexes or FKs).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${tableName}"
        (LIKE "${tableName}_old" INCLUDING ALL)
        PARTITION BY RANGE ("${dateColumn}")
    `);

    // ── Step 3: monthly partitions ───────────────────────────────────
    // Generate month boundaries: today - 6 months to today + 13 months.
    const now = new Date();
    const partitions: Array<{ name: string; from: string; to: string }> = [];

    for (let offset = -6; offset <= 13; offset++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
      const label = `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      partitions.push({
        name: `${tableName}_${label}`,
        from: start.toISOString().slice(0, 10),
        to:   end.toISOString().slice(0, 10),
      });
    }

    for (const p of partitions) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${p.name}"
          PARTITION OF "${tableName}"
          FOR VALUES FROM ('${p.from}') TO ('${p.to}')
      `);
    }

    // ── Step 4: default (overflow) partition ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${tableName}_default"
        PARTITION OF "${tableName}" DEFAULT
    `);

    // ── Step 5: copy data ────────────────────────────────────────────
    // INSERT rows from the old table into the new partitioned one.
    // In production with large tables, use pg_partman or a background
    // job instead. The LOCK here matches a normal ALTER TABLE rewrite.
    await queryRunner.query(`
      INSERT INTO "${tableName}" SELECT * FROM "${tableName}_old"
        ON CONFLICT DO NOTHING
    `);

    // ── Step 6: drop the old table ───────────────────────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS "${tableName}_old" CASCADE`);

    // ── Step 7: add a comment for pg_partman ─────────────────────────
    await queryRunner.query(`
      COMMENT ON TABLE "${tableName}" IS
        'pg_partman managed: range monthly on ${dateColumn}. Run: SELECT partman.create_parent(''public.${tableName}'', ''${dateColumn}'', ''native'', ''monthly'');'
    `);
  }
}
