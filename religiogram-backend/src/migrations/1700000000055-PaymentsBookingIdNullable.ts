import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 055 — Make payments.booking_id nullable.
 *
 * Wallet top-up payments are not associated with a booking.
 * Previously the column was NOT NULL, causing every top-up INSERT to fail
 * with a Postgres constraint violation.
 */
export class PaymentsBookingIdNullable1700000000055 implements MigrationInterface {
  name = 'PaymentsBookingIdNullable1700000000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payments
        ALTER COLUMN booking_id DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add NOT NULL — only safe if no top-up rows exist
    await queryRunner.query(`
      ALTER TABLE payments
        ALTER COLUMN booking_id SET NOT NULL
    `);
  }
}
