import { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchIndexes1700000000016 implements MigrationInterface {
  name = 'SearchIndexes1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // GIN full-text index on temples — uses only columns that exist in the
    // CreateTemples migration (name, city, deity). 'description' was not
    // in the original schema so it is deliberately excluded.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_temples_fts ON temples
        USING GIN(
          to_tsvector('simple',
            name || ' ' || COALESCE(city, '') || ' ' || COALESCE(deity, '')
          )
        )
    `);

    // GIN full-text index on providers — uses full_name, bio, city.
    // Table is named 'providers' (not 'service_providers').
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_fts ON providers
        USING GIN(
          to_tsvector('simple',
            full_name || ' ' || COALESCE(bio, '') || ' ' || COALESCE(city, '')
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_providers_fts');
    await queryRunner.query('DROP INDEX IF EXISTS idx_temples_fts');
  }
}
