import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 066 — Wallet hold CAPTURED status
 *
 * Adds 'captured' to the hold_status postgres enum so that captureHold()
 * can correctly distinguish:
 *   RELEASED = funds returned to user (booking cancelled / hold expired)
 *   CAPTURED = funds consumed by payment (booking confirmed / checkout settled)
 *
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so
 * transaction: false is mandatory.
 */
export class HoldStatusCaptured1700000000066 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard: only add if it doesn't already exist (idempotent)
    const result = await queryRunner.query(
      `SELECT 1 FROM pg_enum
       WHERE enumtypid = 'hold_status'::regtype
         AND enumlabel = 'captured'`,
    );
    if (result.length === 0) {
      await queryRunner.query(`ALTER TYPE hold_status ADD VALUE 'captured'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values — no-op
    // To roll back: recreate the enum without 'captured' and migrate all rows
  }
}
