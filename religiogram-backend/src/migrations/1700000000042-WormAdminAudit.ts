import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v7 (P0-NEW-5 fix): WORM admin audit on the CORRECT table.
 *
 * Earlier draft created and protected `admin_action_log` (singular), but the
 * production `AdminAuditService` writes to `admin_action_logs` (plural,
 * already hash-chained). This migration now installs the WORM triggers on
 * the real table.
 *
 * The DB-layer immutability complements the application-layer hash chain:
 *   - Hash chain detects tampering AFTER the fact.
 *   - WORM trigger prevents the tampering in the first place, even by a
 *     DBA holding superuser (DROP TRIGGER is itself logged in pg_log).
 */
export class WormAdminAudit1700000000042 implements MigrationInterface {
  name = 'WormAdminAudit1700000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── WORM enforcement on admin_action_logs (the real table) ───────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION worm_admin_action_logs()
        RETURNS trigger
        LANGUAGE plpgsql
      AS $$
      BEGIN
        IF (TG_OP = 'UPDATE') THEN
          RAISE EXCEPTION 'admin_action_logs is append-only (WORM): UPDATE not permitted on row id=%', OLD.id
            USING ERRCODE = 'insufficient_privilege';
        ELSIF (TG_OP = 'DELETE') THEN
          RAISE EXCEPTION 'admin_action_logs is append-only (WORM): DELETE not permitted on row id=%', OLD.id
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NULL;
      END;
      $$
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_worm_admin_action_logs_upd ON admin_action_logs`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_worm_admin_action_logs_del ON admin_action_logs`);
    await queryRunner.query(`
      CREATE TRIGGER trg_worm_admin_action_logs_upd
        BEFORE UPDATE ON admin_action_logs
        FOR EACH ROW EXECUTE FUNCTION worm_admin_action_logs()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_worm_admin_action_logs_del
        BEFORE DELETE ON admin_action_logs
        FOR EACH ROW EXECUTE FUNCTION worm_admin_action_logs()
    `);

    // ── Clean up the misspelled table from the v6 draft if a prior run
    //    of this migration created it. Safe to drop — no application code
    //    writes to admin_action_log (singular). ──
    await queryRunner.query(`DROP TABLE IF EXISTS admin_action_log CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_worm_admin_action_logs_upd ON admin_action_logs`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_worm_admin_action_logs_del ON admin_action_logs`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS worm_admin_action_logs()`);
  }
}
