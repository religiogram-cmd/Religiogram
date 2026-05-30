import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D13 — Full-text search: fix config mismatch + add generated tsv columns
 *
 * Problem:
 *   search.service.ts calls to_tsvector('english', …) inline on every query,
 *   but migration 016 created the GIN indexes using to_tsvector('simple', …).
 *   PostgreSQL only uses an index when the query expression EXACTLY matches
 *   the indexed expression — so the GIN indexes were NEVER hit; every search
 *   was a sequential scan on all rows.
 *
 * Fix:
 *   1. Add a GENERATED ALWAYS AS STORED tsvector column `tsv` to both
 *      `temples` and `service_providers` (alias `providers`) using the
 *      'unaccent,english' (or plain 'english') dictionary so it matches what
 *      search.service.ts passes to to_tsquery.
 *   2. Create a GIN index on the new `tsv` column.
 *   3. Drop the old mismatched indexes (no longer useful).
 *
 * After this migration search.service.ts can be simplified to:
 *   WHERE t.tsv @@ to_tsquery('english', $1)
 *   ORDER BY ts_rank_cd(t.tsv, to_tsquery('english', $1)) DESC
 */
export class D13FtsGeneratedColumn1700000000050 implements MigrationInterface {
  public transaction = false;
  name = 'D13FtsGeneratedColumn1700000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── Drop old mismatched simple-config indexes ──────────────────────── */
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_providers_fts;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_temples_fts;`);

    /* ── temples: add generated tsv column ─────────────────────────────── */
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'temples' AND column_name = 'tsv'
        ) THEN
          ALTER TABLE temples
            ADD COLUMN tsv tsvector
              GENERATED ALWAYS AS (
                to_tsvector('english',
                  name || ' ' ||
                  COALESCE(description, '') || ' ' ||
                  COALESCE(city, '') || ' ' ||
                  COALESCE(deity, '')
                )
              ) STORED;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temples_tsv
        ON temples USING gin (tsv);
    `);

    /* ── service_providers: add generated tsv column ────────────────────── */
    // The table may be named 'providers' or 'service_providers'; try both.
    await queryRunner.query(`
      DO $$
      BEGIN
        -- service_providers table
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'service_providers'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'service_providers' AND column_name = 'tsv'
        ) THEN
          ALTER TABLE service_providers
            ADD COLUMN tsv tsvector
              GENERATED ALWAYS AS (
                to_tsvector('english',
                  COALESCE(display_name, '') || ' ' ||
                  COALESCE(bio, '') || ' ' ||
                  COALESCE(city, '')
                )
              ) STORED;
        END IF;

        -- providers table (legacy name used in earlier migrations)
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'providers'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'providers' AND column_name = 'tsv'
        ) THEN
          ALTER TABLE providers
            ADD COLUMN tsv tsvector
              GENERATED ALWAYS AS (
                to_tsvector('english',
                  COALESCE(full_name, '') || ' ' ||
                  COALESCE(bio, '') || ' ' ||
                  COALESCE(city, '')
                )
              ) STORED;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_providers_tsv
        ON service_providers USING gin (tsv)
        WHERE status = 'approved';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_service_providers_tsv;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_temples_tsv;`);
    await queryRunner.query(`ALTER TABLE temples DROP COLUMN IF EXISTS tsv;`);
    await queryRunner.query(`ALTER TABLE service_providers DROP COLUMN IF EXISTS tsv;`);
    await queryRunner.query(`ALTER TABLE providers DROP COLUMN IF EXISTS tsv;`);
  }
}
