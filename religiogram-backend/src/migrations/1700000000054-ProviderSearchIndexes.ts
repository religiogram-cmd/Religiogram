import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderSearchIndexes1700000000054 implements MigrationInterface {
  public transaction = false;
  name = 'ProviderSearchIndexes1700000000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_display_name_trgm
        ON providers USING gin(LOWER(display_name) gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_name_trgm
        ON providers USING gin(LOWER(name) gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_status_religion
        ON providers(status, religion) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_is_online
        ON providers(is_online, status) WHERE deleted_at IS NULL AND is_online = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_display_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_status_religion`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_is_online`);
  }
}
