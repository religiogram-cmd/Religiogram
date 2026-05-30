import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v11 (GAP-1 fix): the audit-chain hash MUST be reproducible from row data.
 *
 * Previously the WRITER hashed app-side `new Date().toISOString()` while the
 * VALIDATOR re-hashed using `created_at` (Postgres `now()`), which always
 * differed by some milliseconds — every audit row failed validation and the
 * nightly tamper-detection alert fired false positives.
 *
 * Fix: persist the app-side timestamp in `app_recorded_at` and hash THAT.
 * `created_at` is left untouched for query / index purposes.
 */
export class AuditChainAppTimestamp1700000000044 implements MigrationInterface {
  name = 'AuditChainAppTimestamp1700000000044';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE admin_action_logs
        ADD COLUMN IF NOT EXISTS app_recorded_at timestamptz
    `);
    // Backfill: for existing rows, set app_recorded_at = created_at so
    // newly-correct validator still validates them (best-effort — the chain
    // is broken anyway from prior false-positive runs; this gives the next
    // validation pass a clean baseline).
    await qr.query(`
      UPDATE admin_action_logs
         SET app_recorded_at = created_at
       WHERE app_recorded_at IS NULL
    `);
    // After backfill, make the column NOT NULL.
    await qr.query(`
      ALTER TABLE admin_action_logs
        ALTER COLUMN app_recorded_at SET NOT NULL
    `);
    // For the chain validator's sequential scan.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_action_logs_app_recorded
        ON admin_action_logs (app_recorded_at)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_admin_action_logs_app_recorded`);
    await qr.query(`ALTER TABLE admin_action_logs DROP COLUMN IF EXISTS app_recorded_at`);
  }
}
