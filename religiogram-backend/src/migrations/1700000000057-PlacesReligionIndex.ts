import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlacesReligionIndex1700000000057 implements MigrationInterface {
  public transaction = false;
  name = 'PlacesReligionIndex1700000000057';

  async up(qr: QueryRunner): Promise<void> {
    // Index for religion filter on places
    await qr.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_places_religion
        ON places (religion)
        WHERE religion IS NOT NULL
    `);
    // Index for provider (priest) name full-text search
    await qr.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_name_fts
        ON providers USING gin(to_tsvector('english', COALESCE(display_name, '') || ' ' || COALESCE(bio, '')))
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_places_religion`);
    await qr.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_providers_name_fts`);
  }
}
