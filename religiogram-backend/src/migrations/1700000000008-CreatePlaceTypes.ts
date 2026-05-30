import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1700000000008 — Generalise `temples` into a neutral `places` concept.
 *
 * We deliberately do NOT rename the table:
 *   - Existing FKs (`user_favorites.temple_id`, future `reviews.temple_id`,
 *     analytics metadata blobs with `templeId`) all point at `temples.id`.
 *     Renaming would cascade into a week of coordinated deploys across
 *     services that read analytics.
 *   - The public API already exposes `/temples/*` URLs that are shared to
 *     social media. Breaking those is a cost with no product upside.
 *
 * Instead we:
 *   1. Add a neutral `type` discriminator column to `temples`.
 *      Default `'temple'` so every existing row keeps a valid value.
 *   2. Create `place_events` and `place_services` tables, both keyed on
 *      the same `temples.id` column. "Place" is the logical name; the
 *      physical FK stays on `temples` for schema coherence.
 *
 * The API layer reads the `type` column and presents the row as a generic
 * "place of worship" to callers of `/places/:id`. The legacy `/temples/*`
 * routes continue to work against the same data.
 */
export class CreatePlaceTypes1700000000008 implements MigrationInterface {
  name = 'CreatePlaceTypes1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. place_type enum + column on temples ──
     *
     * Allowed values are deliberately kept small and broad.
     * "other" is the escape hatch — a spiritual centre, an ashram, a
     * shrine without a clear denominational fit still gets listed.
     *
     * ALTER is wrapped in a NOT EXISTS guard so this migration is safe
     * to re-run on environments that had a hand-rolled hotfix applied.
     */
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'place_type') THEN
          CREATE TYPE place_type AS ENUM (
            'temple',
            'mosque',
            'church',
            'gurudwara',
            'other'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      ALTER TABLE temples
        ADD COLUMN IF NOT EXISTS type place_type NOT NULL DEFAULT 'temple'
    `);

    // Filter index for the type facet — "show me all mosques in Lucknow".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_temples_type
        ON temples (type)
    `);

    /* ── 2. place_events ──
     *
     * Events are prayer times, gatherings, festivals — anything
     * time-bound that happens at the place. One row per event instance
     * for v1. A `recurring` flag is carried for UI badging only; actual
     * recurrence expansion (weekly, monthly) will come in a later
     * migration via an `rrule` column when we ship the calendar view.
     *
     * Indexes:
     *   - (place_id, start_time)            → "next events at this place"
     *   - (start_time) WHERE start_time > now()
     *     gives us an efficient "upcoming events globally" scan later.
     *     We stop short of creating it now — wait until there's a caller.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS place_events (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id    uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        title       varchar(160) NOT NULL,
        description text,
        start_time  timestamptz NOT NULL,
        end_time    timestamptz,
        recurring   boolean NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_events_place_start
        ON place_events (place_id, start_time)
    `);

    /* ── 3. place_services ──
     *
     * Services are non-temporal offerings: "Prayer Services",
     * "Community Kitchen", "Counselling", "Ceremonies". Short catalog,
     * read-mostly. No ordering column yet — display order is created_at
     * ASC for v1; a `sort_order` can be bolted on without a data migration.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS place_services (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id    uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        name        varchar(120) NOT NULL,
        description text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_services_place
        ON place_services (place_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS place_services');
    await queryRunner.query('DROP TABLE IF EXISTS place_events');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_temples_type');
    await queryRunner.query('ALTER TABLE temples DROP COLUMN IF EXISTS type');
    await queryRunner.query('DROP TYPE IF EXISTS place_type');
  }
}
