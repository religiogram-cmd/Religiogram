import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix reviews.reviewable_id type mismatch.
 *
 * When the reviews table was first created (migration 014) `reviewable_id`
 * was UUID. That was fine for temples (uuid PK) but breaks for providers,
 * whose PK is `bigint`. Result: no provider review could ever be inserted
 * (CreateReviewDto validated as UUID) and even if one were, the rating
 * denormalisation SQL `WHERE providers.id::text = reviews.reviewable_id`
 * silently no-op'd because UUIDs never numerically equal a bigint text.
 *
 * Fix: widen the column to `varchar(64)` so it can hold either
 *   - a temple/place UUID like '550e8400-e29b-41d4-a716-446655440000'
 *   - a provider bigint id like '42'
 *
 * Existing rows (all UUIDs today) survive the widen — PostgreSQL casts
 * uuid → varchar lossslessly.
 *
 * Indexes on (reviewable_type, reviewable_id) are preserved automatically
 * by ALTER COLUMN TYPE.
 */
export class ReviewsReviewableIdVarchar1700000000072 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Widen the column. USING clause required because the source type is UUID.
    await queryRunner.query(`
      ALTER TABLE reviews
        ALTER COLUMN reviewable_id TYPE varchar(64) USING reviewable_id::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort revert. Rows containing non-UUID values (provider bigint
    // strings) will fail the cast; caller is expected to backfill first.
    await queryRunner.query(`
      ALTER TABLE reviews
        ALTER COLUMN reviewable_id TYPE uuid USING reviewable_id::uuid
    `);
  }
}
