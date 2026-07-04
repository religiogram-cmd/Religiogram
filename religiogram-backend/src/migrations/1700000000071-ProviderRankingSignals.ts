import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ranking signals + score (migration 071).
 *
 * Adds the columns needed to compute and store a provider ranking score
 * used by the marketplace list ordering. Rather than compute the score on
 * every read (join-heavy, doesn't scale), we denormalise it into
 * `ranking_score` and recompute in three places:
 *
 *   1. On any signal change (rating update, booking completion, KYC approve)
 *      via RankingService.bump()
 *   2. Nightly cron (03:00 UTC) — catches any drift + factors in
 *      time-decay of recent-activity signals
 *   3. Admin-triggered global recompute for on-demand refreshes
 *
 * New columns:
 *   ranking_score            numeric(6,2)  — the score itself, 0–150ish
 *   is_online                boolean       — flip via /providers/me/online
 *   last_activity_at         timestamptz   — last meaningful action
 *   completed_bookings_count int           — denormalised bookings count
 *   response_rate            numeric(4,3)  — 0..1, nullable, computed later
 *   repeat_customer_pct      numeric(4,3)  — 0..1, nullable, computed later
 *
 * Response rate + repeat customer % are placeholders — we don't yet track
 * enough data to compute them but reserving the columns keeps the score
 * formula stable when we do.
 *
 * Marketplace index: btree on (status, ranking_score DESC) — the sort key
 * for the approved-providers list.
 */
export class ProviderRankingSignals1700000000071 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS ranking_score            numeric(6,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_online                boolean      NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_activity_at         timestamptz,
        ADD COLUMN IF NOT EXISTS completed_bookings_count int          NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS response_rate            numeric(4,3),
        ADD COLUMN IF NOT EXISTS repeat_customer_pct      numeric(4,3)
    `);

    // Backfill: completed_bookings_count for existing providers so their
    // first-computed rank isn't unfairly zero. Booking table not guaranteed
    // to exist on very old DBs — wrap in DO block for safety.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'bookings'
        ) THEN
          UPDATE providers p SET completed_bookings_count = sub.n
          FROM (
            SELECT provider_id, COUNT(*)::int AS n
            FROM bookings
            WHERE status = 'completed'
            GROUP BY provider_id
          ) sub
          WHERE p.id::text = sub.provider_id::text;
        END IF;
      END $$
    `);

    // Backfill last_activity_at = updated_at as a reasonable starting point.
    await queryRunner.query(`
      UPDATE providers SET last_activity_at = updated_at WHERE last_activity_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_status_ranking_score
        ON providers (status, ranking_score DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_is_online
        ON providers (is_online) WHERE is_online = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_is_online`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_status_ranking_score`);
    await queryRunner.query(`
      ALTER TABLE providers
        DROP COLUMN IF EXISTS repeat_customer_pct,
        DROP COLUMN IF EXISTS response_rate,
        DROP COLUMN IF EXISTS completed_bookings_count,
        DROP COLUMN IF EXISTS last_activity_at,
        DROP COLUMN IF EXISTS is_online,
        DROP COLUMN IF EXISTS ranking_score
    `);
  }
}
