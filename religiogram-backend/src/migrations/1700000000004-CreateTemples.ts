import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `temples` table + supporting indexes.
 *
 * Key decisions
 * -------------
 *   - PostGIS `geography(Point,4326)` for `location`. We enable the
 *     extension first, idempotently, because RDS/Aurora + Docker-postgres
 *     images behave differently (some ship it preloaded, some don't).
 *   - GIST spatial index on `location` — required for /nearby to stay
 *     fast. Without it, every call scans the full table.
 *   - `pg_trgm` + GIN on LOWER(name) — enables the fuzzy ILIKE used by the
 *     search path. Scoped to LOWER(name) so case differences don't create
 *     index misses.
 *   - CHECK constraint on rating_avg (0..5) catches bad imports early.
 *   - `lat` / `lng` are `NOT NULL` because the row is useless without them;
 *     we keep them in sync with `location` at insert/update time in the
 *     service (there's no UPDATE trigger — it's not worth the complexity
 *     for a table that we write rarely).
 */
export class CreateTemples1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions — idempotent; safe on every environment.
    // `pgcrypto` provides `gen_random_uuid()` used as the PK default; some
    // Postgres builds (e.g. stock RDS) don't preload it.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE TABLE "temples" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"           varchar(200) NOT NULL,
        "city"           varchar(100) NOT NULL,
        "state"          varchar(100),
        "address"        text,
        "location"       geography(Point, 4326) NOT NULL,
        "lat"            double precision NOT NULL,
        "lng"            double precision NOT NULL,
        "rating_avg"     numeric(3,2),
        "rating_count"   int NOT NULL DEFAULT 0,
        "hours"          varchar(120),
        "deity"          varchar(80),
        "is_verified"    boolean NOT NULL DEFAULT false,
        "image_url"      text,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_temples_rating_avg"
          CHECK ("rating_avg" IS NULL OR ("rating_avg" >= 0 AND "rating_avg" <= 5)),
        CONSTRAINT "CHK_temples_lat"
          CHECK ("lat" BETWEEN -90 AND 90),
        CONSTRAINT "CHK_temples_lng"
          CHECK ("lng" BETWEEN -180 AND 180)
      )
    `);

    // Spatial index — serves every /nearby query.
    await queryRunner.query(`
      CREATE INDEX "IDX_temples_location" ON "temples" USING GIST ("location")
    `);

    // City bucket index — serves All-India city filter.
    await queryRunner.query(`
      CREATE INDEX "IDX_temples_city" ON "temples" (LOWER("city"))
    `);

    // Trigram index for name search — supports fast ILIKE.
    await queryRunner.query(`
      CREATE INDEX "IDX_temples_name_trgm"
        ON "temples"
        USING GIN (LOWER("name") gin_trgm_ops)
    `);

    // Covering index for "verified on top" ordering so the hot All-India
    // list doesn't need a sort when no search filter is present.
    await queryRunner.query(`
      CREATE INDEX "IDX_temples_verified_rating"
        ON "temples" ("is_verified" DESC, "rating_avg" DESC NULLS LAST)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temples_verified_rating"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temples_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temples_city"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temples_location"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "temples"`);
    // Deliberately do NOT drop the extensions — other modules may depend on them.
  }
}
