import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 035 — Denormalized social feed (feed_items table)
 *
 * Solves the N+1 fan-out problem in SocialService.getFeed():
 *
 *   OLD:  SELECT friend IDs → query posts by author_id IN (...) OFFSET n
 *         O(n) on friends × posts, unusable at 1M+ rows
 *
 *   NEW:  SELECT FROM feed_items WHERE viewer_id = :id
 *         AND (post_created_at < :d OR (post_created_at = :d AND post_id < :i))
 *         ORDER BY post_created_at DESC, post_id DESC LIMIT :limit
 *         O(log n) via composite index, constant cost per page
 *
 * Write path:
 *   On post.created → FeedService.fanOut() inserts one row per friend.
 *   On friendship.removed → FeedService.pruneForUnfriend() bulk-deletes.
 *
 * The composite index ix_feed_items_viewer_timeline covers the keyset
 * WHERE + ORDER BY so Postgres needs only an index-only scan.
 */
export class FeedItemsTable1700000000035 implements MigrationInterface {
  public transaction = false;
  name = 'FeedItemsTable1700000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Table ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feed_items" (
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

    // ── Primary timeline index ─────────────────────────────────────────────
    // Covers: WHERE viewer_id = :id AND (post_created_at < :d OR ...)
    //          ORDER BY post_created_at DESC, post_id DESC
    // The include of author_id means pruning queries also benefit.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "ix_feed_items_viewer_timeline"
        ON "feed_items" ("viewer_id", "post_created_at" DESC, "post_id" DESC)
        INCLUDE ("author_id")
    `);

    // ── Author index — for efficient pruning on unfriend ──────────────────
    // Covers: DELETE FROM feed_items WHERE viewer_id = :v AND author_id = :a
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "ix_feed_items_viewer_author"
        ON "feed_items" ("viewer_id", "author_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feed_items" CASCADE`);
  }
}
