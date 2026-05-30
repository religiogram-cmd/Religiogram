import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `analytics_events` table.
 *
 * Shape matches `AnalyticsEvent` entity:
 *   - JSONB metadata (future-proof without schema churn)
 *   - Indexed by (event_type, created_at) for time-bucketed rollups
 *   - Indexed by (user_id, created_at) for per-user funnels
 *
 * Retention is handled at the operational level (cron truncates > 90 d).
 * We don't add a trigger here — keeping the table dumb keeps inserts
 * cheap on the hot path.
 */
export class CreateAnalyticsEvents1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // `pgcrypto` was enabled by the temples migration, but this
    // migration could run before it on a fresh DB if ordering ever
    // changes — guard with IF NOT EXISTS.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     uuid,
        "event_type"  varchar(64) NOT NULL,
        "metadata"    jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ip"          varchar(64),
        "user_agent"  varchar(400),
        "created_at"  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Serves "how many search_query events in the last hour?" — the
    // standard product-analytics question. Composite index keeps the
    // plan index-only for simple COUNT queries.
    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_type_created"
        ON "analytics_events" ("event_type", "created_at" DESC)
    `);

    // Per-user funnels / cohorts.
    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_user_created"
        ON "analytics_events" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analytics_events_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_analytics_events_type_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_events"`);
  }
}
