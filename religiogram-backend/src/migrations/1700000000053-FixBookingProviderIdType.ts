import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixBookingProviderIdType1700000000053 implements MigrationInterface {
  name = 'FixBookingProviderIdType1700000000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop FK constraint if it exists
    await queryRunner.query(`
      ALTER TABLE bookings
        DROP CONSTRAINT IF EXISTS fk_bookings_provider_id
    `);
    // Change column type from bigint to uuid
    await queryRunner.query(`
      ALTER TABLE bookings
        ALTER COLUMN provider_id TYPE uuid USING provider_id::text::uuid
    `);
    // Re-add FK constraint
    await queryRunner.query(`
      ALTER TABLE bookings
        ADD CONSTRAINT fk_bookings_provider_id
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_provider_id`);
    await queryRunner.query(`ALTER TABLE bookings ALTER COLUMN provider_id TYPE bigint USING 0`);
  }
}
