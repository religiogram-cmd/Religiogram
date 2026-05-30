import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds denormalised rating_avg / rating_count columns to the providers table.
 * ReviewsService.updateRating() recalculates these atomically on every
 * review create/delete so callers never need a live AVG() scan.
 */
export class ProviderRatingColumns1700000000020 implements MigrationInterface {
  name = 'ProviderRatingColumns1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS rating_avg  NUMERIC(3,2) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS rating_count INT          NOT NULL DEFAULT 0
    `);

    // Backfill from existing reviews (safe to run even on empty table)
    await queryRunner.query(`
      UPDATE providers p
      SET
        rating_avg   = sub.avg_rating,
        rating_count = sub.cnt
      FROM (
        SELECT
          reviewable_id,
          ROUND(AVG(rating)::numeric, 2) AS avg_rating,
          COUNT(*)                        AS cnt
        FROM reviews
        WHERE reviewable_type = 'provider'
          AND is_hidden = false
        GROUP BY reviewable_id
      ) sub
      WHERE p.id::text = sub.reviewable_id::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        DROP COLUMN IF EXISTS rating_avg,
        DROP COLUMN IF EXISTS rating_count
    `);
  }
}
