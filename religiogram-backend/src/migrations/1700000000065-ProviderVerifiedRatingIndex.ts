import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 065 — Composite index supporting the default marketplace discovery sort.
 *
 * Default sort in priests.service.ts findAll():
 *   ORDER BY is_verified DESC, rating_avg DESC NULLS LAST, id DESC
 *
 * This three-column index lets Postgres satisfy the ORDER BY via an index scan
 * (no sort node) and also satisfies the keyset-cursor WHERE predicate:
 *   (is_verified < :iv OR (is_verified = :iv AND rating_avg < :ra OR ...) AND id < :id)
 *
 * Combined with the status partial filter (status = 'approved'), this is the primary
 * index for the most-used discovery query.
 *
 * SAFE: CREATE INDEX CONCURRENTLY — zero downtime.
 * REQUIRES: transaction = false.
 */
export class ProviderVerifiedRatingIndex1700000000065 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        "IDX_providers_verified_rating"
        ON "providers" ("is_verified" DESC, "rating_avg" DESC NULLS LAST, "id" DESC)
        WHERE status = 'approved'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_providers_verified_rating"`);
  }
}
