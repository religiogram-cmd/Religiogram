import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 063 — per_minute_paise index for price-range discovery filters.
 *
 * The new ?minPrice=&maxPrice= query parameters on GET /v1/priests require
 * an index on (per_minute_paise) to avoid full table scans.
 * Also adds a composite (religion, per_minute_paise) index for combined
 * faith + price filters which is the most common discovery query pattern.
 *
 * Both use CREATE INDEX CONCURRENTLY, so this migration must have
 * `transaction = false`.
 */
export class ProviderPriceIndex1700000000063 implements MigrationInterface {
  public transaction = false;

  public async up(runner: QueryRunner): Promise<void> {
    // Single-column index for standalone price range queries
    await runner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_providers_price_per_min"
      ON "providers" ("per_minute_paise")
      WHERE "per_minute_paise" IS NOT NULL
    `);

    // Composite index: faith + price (most common combined filter in discovery)
    await runner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_providers_religion_price"
      ON "providers" ("religion", "per_minute_paise")
      WHERE "per_minute_paise" IS NOT NULL
        AND "status" = 'approved'
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_providers_religion_price"`);
    await runner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_providers_price_per_min"`);
  }
}
