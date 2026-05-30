import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D12 — Notifications table hardening
 *
 * 1. Add FK user_id → users(id) ON DELETE CASCADE so orphaned rows are
 *    automatically cleaned when a user is GDPR-erased.
 * 2. Add GIN index on the `data` JSONB column so notification-type queries
 *    (e.g. `data @> '{"bookingId":"…"}'`) hit an index scan instead of a
 *    sequential scan on millions of rows.
 * 3. Fix the primary key to (id, created_at) to satisfy PostgreSQL's
 *    requirement that the partition key be part of the PK for declarative
 *    range-partitioned tables.
 *
 * NOTE: Steps 1 and 3 require the table NOT to already have conflicting
 * constraints.  The migration uses DO…EXCEPTION blocks to skip idempotently.
 */
export class D12NotificationsSchemaFix1700000000049 implements MigrationInterface {
  public transaction = false;
  name = 'D12NotificationsSchemaFix1700000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. FK user_id → users(id) ON DELETE CASCADE ───────────────────── */
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_notifications_user'
            AND table_name = 'notifications'
        ) THEN
          ALTER TABLE notifications
            ADD CONSTRAINT fk_notifications_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END$$;
    `);

    /* ── 2. GIN index on data JSONB column ─────────────────────────────── */
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_data_gin
        ON notifications USING gin (data jsonb_path_ops);
    `);

    /* ── 3. Composite PK (id, created_at) for partition compatibility ──── */
    // Only alter PK if the table is partitioned and the current PK is just (id).
    // We check pg_partitioned_table to avoid touching non-partitioned setups.
    await queryRunner.query(`
      DO $$
      DECLARE
        v_is_partitioned boolean;
        v_pk_cols text;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM pg_partitioned_table pt
          JOIN pg_class c ON c.oid = pt.partrelid
          WHERE c.relname = 'notifications'
        ) INTO v_is_partitioned;

        IF v_is_partitioned THEN
          SELECT string_agg(a.attname, ',' ORDER BY ix.indoption)
          INTO v_pk_cols
          FROM pg_index ix
          JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
          JOIN pg_class c ON c.oid = ix.indrelid
          WHERE c.relname = 'notifications' AND ix.indisprimary;

          IF v_pk_cols IS NOT NULL AND v_pk_cols NOT LIKE '%created_at%' THEN
            ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
            ALTER TABLE notifications
              ADD CONSTRAINT notifications_pkey PRIMARY KEY (id, created_at);
          END IF;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_data_gin;`);
    await queryRunner.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;`);
    // PK change is intentionally not reversed — reverting it on a live
    // partitioned table risks data loss.
  }
}
