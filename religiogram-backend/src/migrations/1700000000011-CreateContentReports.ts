import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1700000000011 — Content moderation layer.
 *
 * Two things in one migration because they're tightly coupled:
 *
 *   1. `content_reports` — user-generated flags on events / services.
 *      (status is the workflow cursor — pending / reviewed / rejected).
 *   2. `is_hidden` boolean on `place_events` + `place_services` — the
 *      moderation verdict. When an admin approves a report, the target
 *      row flips `is_hidden = true` and the public APIs stop surfacing it.
 *
 * Design notes
 * ------------
 *
 * We chose a *hide* flag rather than a hard delete so:
 *   - the original content survives for audit + dispute resolution;
 *   - an admin can un-hide a row if the report was a bad-faith flag;
 *   - the FK from a reminder (event_reminders.event_id) doesn't
 *     cascade-delete user subscriptions when we moderate.
 *
 * Why one UNIQUE (user_id, target_id) not (user_id, target_type, target_id)?
 *   Because UUIDs for event ids and service ids live in disjoint spaces
 *   (two separate tables, two separate uuid columns), so the pair
 *   (user_id, target_id) is already globally unique enough to dedupe.
 *   One user, one report per target row. This blocks "spam the same
 *   event ten times" without forcing the caller to re-declare target_type
 *   on every dedup check. target_type is still stored so the admin UI
 *   can JOIN against the right table.
 *
 * Status lifecycle:
 *   pending   → user just submitted
 *   reviewed  → admin approved the report (target got hidden)
 *   rejected  → admin dismissed the report (no action taken)
 *
 * Indexes tuned for the review queue + dedup + public-filter paths.
 */
export class CreateContentReports1700000000011 implements MigrationInterface {
  name = 'CreateContentReports1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. Enums ── */
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_target_type') THEN
          CREATE TYPE report_target_type AS ENUM ('event', 'service');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
          CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'rejected');
        END IF;
      END$$;
    `);

    /* ── 2. content_reports table ──
     *
     * place_id is carried alongside target_id even though it's derivable
     * via JOIN. Rationale:
     *   - the admin queue's "by place" filter is a simple WHERE without
     *     an extra JOIN;
     *   - if we ever ship per-owner report visibility ("show me reports
     *     on my claimed place"), the owner_id lookup stays a single join
     *     into temples rather than a two-step join through the target.
     *
     * reviewed_by is ON DELETE SET NULL so an admin account deletion
     * doesn't orphan the audit row.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS content_reports (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place_id     uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        target_type  report_target_type NOT NULL,
        target_id    uuid NOT NULL,
        reason       text NOT NULL,
        status       report_status NOT NULL DEFAULT 'pending',
        admin_note   text,
        reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at  timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);

    /* Dedup: one user cannot stack duplicate reports on the same row.
     * The index doubles as a lookup for "did I already report this?". */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_content_reports_user_target
        ON content_reports (user_id, target_id)
    `);

    /* Admin queue: look up by target row (to show all reports on an event). */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_content_reports_target
        ON content_reports (target_type, target_id)
    `);

    /* Review queue: pending first, newest first. Partial index trims
     * the B-tree once the backlog is cleared. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_content_reports_status_created
        ON content_reports (status, created_at DESC)
    `);

    /* "Reports against this place" — a future owner dashboard query. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_content_reports_place_created
        ON content_reports (place_id, created_at DESC)
    `);

    /* ── 3. is_hidden on the target tables ──
     *
     * DEFAULT false so every existing row stays visible. Partial indexes
     * on (place_id) WHERE is_hidden = false keep the most common read
     * ("fetch visible events for this place") on a tight, tiny index even
     * as the hidden-rows tail grows.
     */
    await queryRunner.query(`
      ALTER TABLE place_events
        ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_events_visible
        ON place_events (place_id, start_time)
        WHERE is_hidden = false
    `);

    await queryRunner.query(`
      ALTER TABLE place_services
        ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_services_visible
        ON place_services (place_id, created_at)
        WHERE is_hidden = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_place_services_visible');
    await queryRunner.query('ALTER TABLE place_services DROP COLUMN IF EXISTS is_hidden');

    await queryRunner.query('DROP INDEX IF EXISTS IDX_place_events_visible');
    await queryRunner.query('ALTER TABLE place_events DROP COLUMN IF EXISTS is_hidden');

    await queryRunner.query('DROP INDEX IF EXISTS IDX_content_reports_place_created');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_content_reports_status_created');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_content_reports_target');
    await queryRunner.query('DROP INDEX IF EXISTS UQ_content_reports_user_target');
    await queryRunner.query('DROP TABLE IF EXISTS content_reports');
    await queryRunner.query('DROP TYPE IF EXISTS report_status');
    await queryRunner.query('DROP TYPE IF EXISTS report_target_type');
  }
}
