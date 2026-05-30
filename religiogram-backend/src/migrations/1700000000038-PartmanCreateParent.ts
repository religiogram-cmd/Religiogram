import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 038 — pg_partman: register partitioned tables with the partition manager
 *
 * This migration calls partman.create_parent() for all RANGE-partitioned tables
 * so that pg_partman:
 *   1. Knows about the tables and their partition strategy
 *   2. Auto-creates `premake` (default 4) future monthly partitions
 *   3. Detaches and (optionally) drops old partitions based on retention config
 *   4. Responds to POST /v1/admin/ops/partman/run (PartmanService)
 *   5. Is maintained by the K8s CronJob (k8s/partman/cronjob.yaml)
 *
 * Prerequisites:
 *   - Migration 034: bookings, ledger_entries, notifications partitioned
 *   - Migration 036: feed_items partitioned
 *   - pg_partman extension installed (docker/init.sql + docker/Dockerfile.postgres)
 *
 * Idempotent: create_parent() raises an error if already registered;
 * this migration catches and ignores that error so re-running is safe.
 *
 * Retention policy (partman.part_config UPDATE):
 *   bookings:       retain 24 months
 *   ledger_entries: retain 36 months (financial records — longer retention)
 *   notifications:  retain  6 months
 *   feed_items:     retain  3 months (high-volume; old feed entries are worthless)
 *
 * Detach vs DROP:
 *   retention_keep_table = true  → partition is detached (not dropped) after retention
 *   retention_keep_table = false → partition is dropped after retention
 *   We use true by default for safety; set false in production after validating
 *   that no direct queries target old partition tables.
 */
export class PartmanCreateParent1700000000038 implements MigrationInterface {
  name = 'PartmanCreateParent1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verify pg_partman extension is installed before attempting to use it.
    // If not installed, skip the migration with a warning rather than failing.
    const extResult = await queryRunner.query(`
      SELECT COUNT(*) AS cnt
      FROM pg_extension
      WHERE extname = 'pg_partman'
    `);
    const extInstalled = parseInt(extResult[0].cnt, 10) > 0;

    if (!extInstalled) {
      console.warn(
        '[Migration 038] pg_partman extension not found. ' +
        'Skipping partman registration. ' +
        'Install pg_partman and re-run this migration to enable automatic partition management.',
      );
      return;
    }

    // Helper: register a table with pg_partman, ignoring "already registered" errors.
    const registerTable = async (
      tableName: string,
      partitionInterval: string,
      premake: number,
    ): Promise<void> => {
      try {
        await queryRunner.query(`
          SELECT partman.create_parent(
            p_parent_table   => 'public.${tableName}',
            p_control        => 'created_at',
            p_type           => 'native',
            p_interval       => '${partitionInterval}',
            p_premake        => ${premake},
            p_start_partition => (DATE_TRUNC('month', NOW() - INTERVAL '6 months'))::text
          )
        `);
        console.log(`[Migration 038] Registered ${tableName} with pg_partman`);
      } catch (err: any) {
        // pg_partman raises: "Given parent table has already been setup for partitioning"
        if (err.message?.includes('already been setup')) {
          console.log(`[Migration 038] ${tableName} already registered — skipping`);
        } else {
          throw err;
        }
      }
    };

    // ── Register partitioned tables ─────────────────────────────────────────
    // premake=4: pre-create 4 months of future partitions.
    // The K8s CronJob runs on the 1st of each month to create the next batch.

    await registerTable('bookings',       '1 month', 4);
    await registerTable('ledger_entries', '1 month', 4);
    await registerTable('notifications',  '1 month', 4);
    await registerTable('feed_items',     '1 month', 4);

    // ── Configure retention per table ───────────────────────────────────────
    await queryRunner.query(`
      UPDATE partman.part_config SET
        retention              = '24 months',
        retention_keep_table   = true,   -- detach, don't drop (safe default)
        retention_keep_index   = false,  -- drop indexes on detached partitions
        infinite_time_partitions = true, -- always create future partitions
        automatic_maintenance  = 'on'
      WHERE parent_table = 'public.bookings'
    `);

    await queryRunner.query(`
      UPDATE partman.part_config SET
        retention              = '36 months', -- financial records kept longer
        retention_keep_table   = true,
        retention_keep_index   = false,
        infinite_time_partitions = true,
        automatic_maintenance  = 'on'
      WHERE parent_table = 'public.ledger_entries'
    `);

    await queryRunner.query(`
      UPDATE partman.part_config SET
        retention              = '6 months',
        retention_keep_table   = false,  -- drop old notification partitions
        retention_keep_index   = false,
        infinite_time_partitions = true,
        automatic_maintenance  = 'on'
      WHERE parent_table = 'public.notifications'
    `);

    await queryRunner.query(`
      UPDATE partman.part_config SET
        retention              = '3 months',  -- feed is high-volume, short-lived
        retention_keep_table   = false,
        retention_keep_index   = false,
        infinite_time_partitions = true,
        automatic_maintenance  = 'on'
      WHERE parent_table = 'public.feed_items'
    `);

    // ── Run first maintenance pass to create premake future partitions ───────
    // This creates the next 4 monthly partitions for each table immediately.
    await queryRunner.query(`SELECT partman.run_maintenance_proc()`);

    console.log('[Migration 038] pg_partman registration complete. Future partitions created.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unregister tables from pg_partman tracking.
    // This does NOT drop the partitions — only removes partman's awareness.
    // The actual partitions (child tables) remain and continue to function.
    for (const table of ['bookings', 'ledger_entries', 'notifications', 'feed_items']) {
      await queryRunner.query(
        `DELETE FROM partman.part_config WHERE parent_table = 'public.${table}'`,
      );
    }
    console.log('[Migration 038] Removed pg_partman registrations (partitions preserved)');
  }
}
