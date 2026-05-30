import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 039 — Community v2
 *
 * Changes:
 * 1. Add missing columns to `social_posts`:
 *    - `text`         TEXT NULL
 *    - `image_url`    TEXT NULL
 *    - `shares_count` INT NOT NULL DEFAULT 0
 *    - `category`     VARCHAR(60) NULL DEFAULT 'Experiences'
 * 2. Create `post_bookmarks` table with unique (user_id, post_id) index.
 */
export class CommunityV21700000000039 implements MigrationInterface {
  name = 'CommunityV21700000000039';

  async up(qr: QueryRunner): Promise<void> {
    // ── 1. Extend social_posts ─────────────────────────────────────────────
    await qr.query(`
      ALTER TABLE social_posts
        ADD COLUMN IF NOT EXISTS text         TEXT,
        ADD COLUMN IF NOT EXISTS image_url    TEXT,
        ADD COLUMN IF NOT EXISTS shares_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS category     VARCHAR(60) DEFAULT 'Experiences'
    `);

    // ── 2. post_bookmarks table ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS post_bookmarks (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
        post_id    UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_post_bookmarks_user_post
        ON post_bookmarks (user_id, post_id)
    `);

    // Covering index for fast "get all bookmarks for a user" queries
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_post_bookmarks_user
        ON post_bookmarks (user_id, created_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS post_bookmarks`);

    await qr.query(`
      ALTER TABLE social_posts
        DROP COLUMN IF EXISTS text,
        DROP COLUMN IF EXISTS image_url,
        DROP COLUMN IF EXISTS shares_count,
        DROP COLUMN IF EXISTS category
    `);
  }
}
