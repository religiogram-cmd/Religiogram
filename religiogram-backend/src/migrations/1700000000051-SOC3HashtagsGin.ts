import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SOC3 — Hashtags: migrate from simple-array TEXT to native text[] + GIN index.
 *
 * Problem:
 *   The `hashtags` column was stored as a comma-separated string via TypeORM's
 *   `simple-array` type, and queried with `LIKE '%tag%'` — a full-table scan
 *   on every hashtag search (O(n) even with millions of posts).
 *
 * Fix:
 *   1. Convert the column to a native PostgreSQL `text[]` array.
 *      - Existing CSV data ('yoga,meditation,shiva') is split on comma and
 *        stored as an array.
 *   2. Normalise all existing values to lowercase (no # prefix) so the GIN
 *      index is selective.
 *   3. Create a GIN index so `= ANY(p.hashtags)` hits an index scan.
 */
export class SOC3HashtagsGin1700000000051 implements MigrationInterface {
  public transaction = false;
  name = 'SOC3HashtagsGin1700000000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. Add a temporary column for the new type ─────────────────────── */
    await queryRunner.query(`
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags_arr text[] DEFAULT '{}';
    `);

    /* ── 2. Migrate existing CSV data → text[] ──────────────────────────── */
    await queryRunner.query(`
      UPDATE posts
      SET hashtags_arr = ARRAY(
        SELECT lower(trim(both ' ' from elem))
        FROM unnest(string_to_array(COALESCE(hashtags::text, ''), ',')) AS elem
        WHERE trim(both ' ' from elem) <> ''
      )
      WHERE hashtags IS NOT NULL;
    `);

    /* ── 3. Drop old column and rename new one ───────────────────────────── */
    await queryRunner.query(`ALTER TABLE posts DROP COLUMN IF EXISTS hashtags;`);
    await queryRunner.query(`ALTER TABLE posts RENAME COLUMN hashtags_arr TO hashtags;`);

    /* ── 4. GIN index for = ANY() queries ───────────────────────────────── */
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_hashtags_gin
        ON posts USING gin (hashtags)
        WHERE is_deleted = false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_posts_hashtags_gin;`);
    // Reverse: convert text[] back to comma-separated text
    await queryRunner.query(`
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags_old text;
    `);
    await queryRunner.query(`
      UPDATE posts SET hashtags_old = array_to_string(hashtags, ',');
    `);
    await queryRunner.query(`ALTER TABLE posts DROP COLUMN IF EXISTS hashtags;`);
    await queryRunner.query(`ALTER TABLE posts RENAME COLUMN hashtags_old TO hashtags;`);
  }
}
