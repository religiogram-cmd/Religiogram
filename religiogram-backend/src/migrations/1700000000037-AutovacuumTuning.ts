import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 037 — Autovacuum tuning for high-write partitioned tables
 *
 * ── Problem ───────────────────────────────────────────────────────────────────
 * PostgreSQL's default autovacuum thresholds are calibrated for small tables:
 *
 *   autovacuum_vacuum_scale_factor  = 0.20  (vacuum when 20% of rows are dead)
 *   autovacuum_analyze_scale_factor = 0.10  (analyze when 10% of rows changed)
 *
 * On a 100M-row table this means:
 *   • autovacuum won't trigger until 20 000 000 dead tuples accumulate
 *   • Table bloat grows unchecked, wasting storage and slowing sequential scans
 *   • Index bloat degrades query performance
 *   • Transaction ID wraparound risk increases (forced autovacuum at ~2B XIDs)
 *
 * For partitioned tables the settings apply to EACH child partition independently.
 * We set them on the parent tables (PostgreSQL 13+ propagates to new children) and
 * also enumerate existing child partitions to catch ones already created.
 *
 * ── Solution ──────────────────────────────────────────────────────────────────
 * Set aggressive autovacuum parameters on all four hot-write partitioned tables:
 *
 *   autovacuum_vacuum_scale_factor  = 0.01  (vacuum when 1% of rows are dead)
 *   autovacuum_analyze_scale_factor = 0.005 (analyze when 0.5% of rows changed)
 *   autovacuum_vacuum_cost_delay    = 2     (2ms cost delay — less I/O throttling)
 *   autovacuum_vacuum_threshold     = 1000  (at minimum 1000 dead tuples to trigger)
 *
 * These settings kick in autovacuum much earlier on large tables while still
 * avoiding excessive overhead on small ones (threshold provides a floor).
 *
 * fillfactor = 80 is set on parent tables:
 *   • Leaves 20% of each page empty for in-place HOT (Heap Only Tuple) updates
 *   • HOT updates don't create dead index entries — dramatically reduces index bloat
 *   • Most applicable to tables with frequent UPDATE patterns (bookings state machine,
 *     ledger_entries status, notifications read_at)
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Tables tuned: bookings, ledger_entries, notifications, feed_items
 * Also applies settings to existing child partitions via pg_inherits query.
 *
 * ── Notes ─────────────────────────────────────────────────────────────────────
 * • These are storage-parameter changes — no table rewrite, zero downtime.
 * • fillfactor only affects NEW pages; existing pages are not re-packed.
 *   A VACUUM FULL or CLUSTER would re-pack, but those take an ACCESS EXCLUSIVE lock.
 *   Organic table growth with the new fillfactor is sufficient.
 * • Monitor pg_stat_user_tables for n_dead_tup and last_autovacuum to verify
 *   the new settings are firing correctly.
 */
export class AutovacuumTuning1700000000037 implements MigrationInterface {
  name = 'AutovacuumTuning1700000000037';

  private readonly HOT_TABLES = [
    'bookings',
    'ledger_entries',
    'notifications',
    'feed_items',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.HOT_TABLES) {
      await this._tuneTable(queryRunner, table);
    }

    // ── Also tune existing child partitions ──────────────────────────────────
    // pg_inherits links child partitions to their parent.
    // We query all children and apply the same vacuum settings.
    // New children created by PartmanService will inherit from the parent
    // (PostgreSQL 13+ CREATE TABLE ... PARTITION OF inherits storage params).
    await queryRunner.query(`
      DO $$
      DECLARE
        parent_name TEXT;
        child_name  TEXT;
      BEGIN
        FOREACH parent_name IN ARRAY ARRAY['bookings','ledger_entries','notifications','feed_items']
        LOOP
          FOR child_name IN
            SELECT c.relname
            FROM pg_inherits i
            JOIN pg_class p ON p.oid = i.inhparent
            JOIN pg_class c ON c.oid = i.inhrelid
            WHERE p.relname = parent_name
          LOOP
            EXECUTE format(
              'ALTER TABLE %I SET (
                autovacuum_vacuum_scale_factor  = 0.01,
                autovacuum_analyze_scale_factor = 0.005,
                autovacuum_vacuum_cost_delay    = 2,
                autovacuum_vacuum_threshold     = 1000
              )',
              child_name
            );
          END LOOP;
        END LOOP;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reset to PostgreSQL defaults.
    for (const table of this.HOT_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}" RESET (
          autovacuum_vacuum_scale_factor,
          autovacuum_analyze_scale_factor,
          autovacuum_vacuum_cost_delay,
          autovacuum_vacuum_threshold,
          fillfactor
        )
      `);
    }

    // Reset child partitions too
    await queryRunner.query(`
      DO $$
      DECLARE
        parent_name TEXT;
        child_name  TEXT;
      BEGIN
        FOREACH parent_name IN ARRAY ARRAY['bookings','ledger_entries','notifications','feed_items']
        LOOP
          FOR child_name IN
            SELECT c.relname
            FROM pg_inherits i
            JOIN pg_class p ON p.oid = i.inhparent
            JOIN pg_class c ON c.oid = i.inhrelid
            WHERE p.relname = parent_name
          LOOP
            EXECUTE format(
              'ALTER TABLE %I RESET (
                autovacuum_vacuum_scale_factor,
                autovacuum_analyze_scale_factor,
                autovacuum_vacuum_cost_delay,
                autovacuum_vacuum_threshold
              )',
              child_name
            );
          END LOOP;
        END LOOP;
      END $$
    `);
  }

  private async _tuneTable(queryRunner: QueryRunner, table: string): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "${table}" SET (
        autovacuum_vacuum_scale_factor  = 0.01,
        autovacuum_analyze_scale_factor = 0.005,
        autovacuum_vacuum_cost_delay    = 2,
        autovacuum_vacuum_threshold     = 1000,
        -- fillfactor=80: leave 20% of each page free for HOT updates
        -- Reduces dead index entries for UPDATE-heavy tables (bookings state
        -- machine, ledger_entries status updates, notifications read_at)
        fillfactor                      = 80
      )
    `);
  }
}
