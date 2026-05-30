import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * No-op migration — superseded by 1700000000016-SearchIndexes.ts.
 * Kept in the sequence so the migration table stays contiguous.
 */
export class SearchIndexes1700000000019 implements MigrationInterface {
  name = 'SearchIndexes1700000000019';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Nothing to do — indexes already created in migration 016.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Nothing to revert.
  }
}
