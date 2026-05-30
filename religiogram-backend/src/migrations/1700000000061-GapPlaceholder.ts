import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLACEHOLDER — Migration 061 was intentionally skipped during a batch merge.
 * This no-op migration exists solely to restore the sequential label in the
 * migration audit trail. TypeORM sorts by timestamp so runtime ordering is
 * unaffected, but the gap caused confusion during incident forensics.
 *
 * DO NOT add functional changes here. Create a new numbered migration instead.
 */
export class GapPlaceholder1700000000061 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // intentional no-op — see comment above
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // intentional no-op
  }
}
