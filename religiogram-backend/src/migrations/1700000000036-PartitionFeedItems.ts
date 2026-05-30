import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 036 — Convert feed_items to a RANGE-partitioned table
 *
 * Migration 035 created feed_items as a plain (non-partitioned) heap table.
 * PartmanService lists feed_items in PARTITIONED_TABLES and will try to run:
 *
 *   CREATE TABLE "feed_items_2025_06" PARTITION OF "feed_items" FOR VALUES ...
 *
 * This fails with:
 *   ERROR: "feed_items" is not partitioned
 *
 * This migration fixes the structural mismatch:
 *
 *   1. Rename feed_items → feed_items_old (preserves any existing rows)
 *   2. Create new feed_items PARTITION BY RANGE (created_at)
 *      — PK is (id, created_at) because PostgreSQL requires the partition key
 *        to be part of every unique/primary constraint on a partitioned table.
 *      — UNIQUE (viewer_id, post_id) is DROPPED — global unique constraints
 *        across partitions are not possible in PostgreSQL. Duplicate-prevention
 *        is handled at the application layer via ON CONFLICT DO NOTHING.
 *   3. Create monthly child partitions: today – 6 months → today + 13 months
 *   4. Create DEFAULT overflow partition
 *   5. Copy rows from feed_items_old (empty at this point in development;
 *      safe INSERT ... SELECT for small tables)
 *   6. Drop feed_items_old
 *   7. Re-create covering indexes on each child partition (automatically
 *      inherited from parent CREATE INDEX statements)
 *
 * ── PostgreSQL partitioning rules applied ─────────────────────────────────
 *   • PRIMARY KEY must include all partition columns → PK (id, created_at)
 *   • UNIQUE constraints must include partition key → dropped (see above)
 *   • FOREIGN KEY from partitioned table to other tables is allowed (PG 12+)
 *   • FOREIGN KEY from other tables INTO a partitioned table requires the
 *     referenced columns to be part of a PK/UNIQUE — satisfied by (id, created_at)
 *     for any table that references feed_items.id + created_at together.
 *     No other table currently references feed_items, so this is fine.
 *
 * ── PartmanService compatibility ──────────────────────────────────────────
 *   After this migration, PartmanService._ensurePartition('feed_items', n)
 *   will successfully create child partitions monthly.
 *   The DEFAULT partition catches any overflow rows until the next cron run.
 */
export class PartitionFeedItems1700000000036 implements MigrationInterface {
  name = 'PartitionFeedItems1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 1: rename existing plain table ──────────────────────────────
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "feed_items" RENAME TO "feed_items_old"
    `);

    // Drop indexes that were on the old table (they will be re-created below
    // as inherited indexes on the new partitioned parent).
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_feed_items_viewer_timeline"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_feed_items_viewer_author"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_feed_items_viewer"`);

    // ── Step 2: create partitioned table ─────────────────────────────────
    // PRIMARY KEY (id, created_at) — partition key must be in every unique
    // constraint per PostgreSQL's partitioning rules.
    await queryRunner.query(`
      CREATE TABLE "feed_items" (
        "id"              UUID              NOT NULL DEFAULT gen_random_uuid(),
        "viewer_id"       UUID              NOT NULL,
        "post_id"         UUID              NOT NULL,
        "author_id"       UUID              NOT NULL,
        "post_created_at" TIMESTAMPTZ       NOT NULL,
        "created_at"      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_feed_items" PRIMARY KEY ("id", "created_at"),
        CONSTRAINT "fk_feed_items_post"
          FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_feed_items_viewer"
          FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE
      ) PARTITION BY RANGE ("created_at")
    `);

    // ── Step 3: monthly child partitions ─────────────────────────────────
    const now = new Date();
    for (let offset = -6; offset <= 13; offset++) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
      const label = `${start.getUTCFullYear()}_${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "feed_items_${label}"
          PARTITION OF "feed_items"
          FOR VALUES FROM ('${start.toISOString().slice(0, 10)}')
                        TO ('${end.toISOString().slice(0, 10)}')
      `);
    }

    // ── Step 4: default overflow partition ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feed_items_default"
        PARTITION OF "feed_items" DEFAULT
    `);

    // ── Step 5: parent-level indexes (inherited by all child partitions) ──
    // Primary timeline keyset index — covers the hot read path:
    //   WHERE viewer_id = :id
    //     AND (post_created_at < :d OR (post_created_at = :d AND post_id < :i))
    //   ORDER BY post_created_at DESC, post_id DESC
    await queryRunner.query(`
      CREATE INDEX "ix_feed_items_viewer_timeline"
        ON "feed_items" ("viewer_id", "post_created_at" DESC, "post_id" DESC)
        INCLUDE ("author_id")
    `);

    // Author index — efficient pruning on unfriend:
    //   DELETE FROM feed_items WHERE viewer_id = :v AND author_id = :a
    await queryRunner.query(`
      CREATE INDEX "ix_feed_items_viewer_author"
        ON "feed_items" ("viewer_id", "author_id")
    `);

    // ── Step 6: migrate existing rows ────────────────────────────────────
    // In development this table is empty. In a live system this would be
    // handled by a background copy job to avoid table locks.
    await queryRunner.query(`
      INSERT INTO "feed_items"
        SELECT "id", "viewer_id", "post_id", "author_id", "post_created_at", "created_at"
        FROM "feed_items_old"
      ON CONFLICT DO NOTHING
    `);

    // ── Step 7: drop old table ────────────────────────────────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS "feed_items_old" CASCADE`);

    // ── Step 8: add pg_partman hint comment ──────────────────────────────
    await queryRunner.query(`
      COMMENT ON TABLE "feed_items" IS
        'pg_partman managed: range monthly on created_at. Run: SELECT partman.create_parent(''public.feed_items'', ''created_at'', ''native'', ''monthly'');'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the partitioned table cascades to all child partitions.
    // Re-creating the original non-partitioned structure:
    await queryRunner.query(`DROP TABLE IF EXISTS "feed_items" CASCADE`);
    await queryRunner.query(`
      CREATE TABLE "feed_items" (
        "id"              UUID              DEFAULT gen_random_uuid() NOT NULL,
        "viewer_id"       UUID              NOT NULL,
        "post_id"         UUID              NOT NULL,
        "author_id"       UUID              NOT NULL,
        "post_created_at" TIMESTAMPTZ       NOT NULL,
        "created_at"      TIMESTAMPTZ       DEFAULT NOW() NOT NULL,
        CONSTRAINT "pk_feed_items" PRIMARY KEY ("id"),
        CONSTRAINT "uq_feed_items_viewer_post" UNIQUE ("viewer_id", "post_id"),
        CONSTRAINT "fk_feed_items_post"
          FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_feed_items_viewer"
          FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_feed_items_viewer_timeline"
        ON "feed_items" ("viewer_id", "post_created_at" DESC, "post_id" DESC)
        INCLUDE ("author_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_feed_items_viewer_author"
        ON "feed_items" ("viewer_id", "author_id")
    `);
  }
}
