import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-specialisation years-of-experience.
 *
 * Adds a JSONB column `specialisation_years` to `providers` — a map of
 * specialisation label → years. Example row:
 *
 *   { "Vedic Astrology": 20, "Tarot Reading": 5 }
 *
 * We use a JSONB blob rather than a join table because:
 *   • Every read of a provider profile needs the years alongside the names,
 *     which is already in `specialisations text[]` — a JSONB map avoids the
 *     JOIN and keeps the marketplace query the same shape.
 *   • Admin analytics (Phase 3) can still count usage per spec by scanning
 *     the text[] array with a GIN index — the years column isn't on that
 *     hot path.
 *   • Years is a "labeled experience" attribute, not a first-class entity —
 *     there's nothing else that would ever join to a `provider_specs` table.
 *
 * If we ever need per-spec certificates, verification, or reviews we'll
 * introduce a proper join table then. Until then this is the smallest
 * change that unlocks the feature.
 *
 * Backfill: every existing row already has an empty {} default via the
 * column DEFAULT, so no data migration is required. Providers who added
 * specialisations before this migration will simply lack years data — the
 * marketplace UI treats a missing years entry as "not specified" and hides
 * the badge.
 */
export class ProviderSpecialisationYears1700000000069 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS specialisation_years jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    // No index — the column is read-only from the row's perspective (single
    // key lookup by primary key). If we ever need to filter "who has 10+ yrs
    // in Tarot" we'll add a functional GIN index at that time.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers DROP COLUMN IF EXISTS specialisation_years
    `);
  }
}
