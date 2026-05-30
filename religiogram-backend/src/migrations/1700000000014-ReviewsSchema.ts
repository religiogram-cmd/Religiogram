import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the reviews table with:
 *  - Composite unique index  (user + entity) — one review per user per entity
 *  - GIN full-text index on body for search
 *  - rating_avg / rating_count columns added to temples and providers tables
 *    (no-op if already present — idempotent via IF NOT EXISTS / DO $$ blocks)
 */
export class ReviewsSchema1700000000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewable_type     VARCHAR(20) NOT NULL,
        reviewable_id       UUID        NOT NULL,
        rating              SMALLINT    NOT NULL CHECK (rating >= 1 AND rating <= 5),
        body                TEXT,
        is_verified_purchase BOOLEAN    NOT NULL DEFAULT FALSE,
        helpful_count       INT         NOT NULL DEFAULT 0,
        is_hidden           BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_target
        ON reviews(reviewable_type, reviewable_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_target
        ON reviews(user_id, reviewable_type, reviewable_id)
    `);

    // GIN index for full-text search on review body
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_body_fts
        ON reviews USING GIN(to_tsvector('english', COALESCE(body, '')))
    `);

    // Auto-update updated_at via trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reviews_set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
      CREATE TRIGGER trg_reviews_updated_at
        BEFORE UPDATE ON reviews
        FOR EACH ROW EXECUTE FUNCTION reviews_set_updated_at()
    `);

    // Add rating columns to temples if not already present
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='temples' AND column_name='rating_avg'
        ) THEN
          ALTER TABLE temples
            ADD COLUMN rating_avg   NUMERIC(3,2),
            ADD COLUMN rating_count INT NOT NULL DEFAULT 0;
        END IF;
      END $$
    `);

    // Add rating columns to providers if not already present
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='providers' AND column_name='rating_avg'
        ) THEN
          ALTER TABLE providers
            ADD COLUMN rating_avg   NUMERIC(3,2),
            ADD COLUMN rating_count INT NOT NULL DEFAULT 0;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reviews CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS reviews_set_updated_at CASCADE`);

    // Remove rating columns from temples and providers
    await queryRunner.query(`
      ALTER TABLE temples
        DROP COLUMN IF EXISTS rating_avg,
        DROP COLUMN IF EXISTS rating_count
    `);
    await queryRunner.query(`
      ALTER TABLE providers
        DROP COLUMN IF EXISTS rating_avg,
        DROP COLUMN IF EXISTS rating_count
    `);
  }
}
