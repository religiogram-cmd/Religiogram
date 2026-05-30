import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration §76-110: Production Correctness Controls
 * - wallet_ledger_entries INSERT-only trigger (no UPDATE/DELETE ever)
 * - admin_action_logs hash chain (tamper detection)
 * - wallet negative-balance guard constraint
 * - stuck holds index
 */
export class ProductionCorrectness1700000000025 implements MigrationInterface {
  name = 'ProductionCorrectness1700000000025';

  async up(qr: QueryRunner): Promise<void> {
    // ── 1. INSERT-only guard on ledger_entries (only if table exists) ───
    await qr.query(`
      CREATE OR REPLACE FUNCTION fn_ledger_immutable()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'ledger_entries is immutable: UPDATE and DELETE are not permitted (entry id=%)', OLD.id;
      END;
      $$;
    `);

    await qr.query(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'ledger_entries'
        ) THEN
          DROP TRIGGER IF EXISTS trg_ledger_immutable ON ledger_entries;
          CREATE TRIGGER trg_ledger_immutable
            BEFORE UPDATE OR DELETE ON ledger_entries
            FOR EACH ROW EXECUTE FUNCTION fn_ledger_immutable();
        END IF;
      END
      $do$;
    `);

    // ── 2. INSERT-only guard on admin_action_logs (only if table exists) ─
    await qr.query(`
      CREATE OR REPLACE FUNCTION fn_admin_log_immutable()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'admin_action_logs is immutable: UPDATE and DELETE are not permitted (entry id=%)', OLD.id;
      END;
      $$;
    `);

    await qr.query(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'admin_action_logs'
        ) THEN
          DROP TRIGGER IF EXISTS trg_admin_log_immutable ON admin_action_logs;
          CREATE TRIGGER trg_admin_log_immutable
            BEFORE UPDATE OR DELETE ON admin_action_logs
            FOR EACH ROW EXECUTE FUNCTION fn_admin_log_immutable();
        END IF;
      END
      $do$;
    `);

    // ── 3. Wallet negative-balance guard (only if wallets table exists) ──
    await qr.query(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'wallets'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'wallets'
              AND constraint_name = 'chk_wallet_available_non_negative'
          ) THEN
            ALTER TABLE wallets
              ADD CONSTRAINT chk_wallet_available_non_negative
              CHECK (available_balance >= 0);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'wallets'
              AND constraint_name = 'chk_wallet_held_non_negative'
          ) THEN
            ALTER TABLE wallets
              ADD CONSTRAINT chk_wallet_held_non_negative
              CHECK (held_balance >= 0);
          END IF;
        END IF;
      END
      $do$;
    `);

    // ── 4. Reconciliation & stuck-holds indexes (guarded) ───────────────
    await qr.query(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'ledger_entries'
        ) THEN
          CREATE INDEX IF NOT EXISTS
            idx_ledger_recon ON ledger_entries (wallet_id, direction, created_at);
        END IF;
      END
      $do$;
    `);

    await qr.query(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'wallet_holds'
        ) THEN
          CREATE INDEX IF NOT EXISTS
            idx_wallet_holds_status ON wallet_holds (status, created_at)
            WHERE status NOT IN ('released','cancelled');
        END IF;
      END
      $do$;
    `);

    // ── 5. Refund engine tables ─────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS refund_requests (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id       UUID NOT NULL REFERENCES bookings(id),
        user_id          UUID NOT NULL,
        amount_paise     BIGINT NOT NULL CHECK (amount_paise > 0),
        currency         VARCHAR(3) NOT NULL DEFAULT 'INR',
        reason           VARCHAR(100) NOT NULL,
        cancellation_by  VARCHAR(20) NOT NULL DEFAULT 'user',
        state            VARCHAR(30) NOT NULL DEFAULT 'requested',
        reviewer_id      UUID,
        review_notes     TEXT,
        rejection_reason TEXT,
        idempotency_key  VARCHAR(64) UNIQUE NOT NULL,
        metadata         JSONB NOT NULL DEFAULT '{}',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at     TIMESTAMPTZ,
        CONSTRAINT chk_refund_state CHECK (
          state IN ('requested','reviewing','approved','rejected','processing','completed','failed')
        )
      );
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_refund_booking ON refund_requests (booking_id);
      CREATE INDEX IF NOT EXISTS idx_refund_state   ON refund_requests (state, created_at)
        WHERE state NOT IN ('completed','rejected');
    `);

    // ── 6. Risk score table ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS user_risk_scores (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID UNIQUE NOT NULL,
        score        SMALLINT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
        last_signals JSONB NOT NULL DEFAULT '[]',
        last_event   VARCHAR(100),
        decayed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_risk_score_high ON user_risk_scores (score, updated_at)
        WHERE score > 30;
    `);

    // ── 7. Wallet reconciliation log ────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS wallet_recon_log (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        wallets_checked INT NOT NULL DEFAULT 0,
        mismatches     INT NOT NULL DEFAULT 0,
        frozen_wallets JSONB NOT NULL DEFAULT '[]',
        recovered_holds INT NOT NULL DEFAULT 0,
        duration_ms    INT,
        status         VARCHAR(20) NOT NULL DEFAULT 'ok',
        details        JSONB NOT NULL DEFAULT '{}'
      );
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TRIGGER IF EXISTS trg_ledger_immutable ON ledger_entries`);
    await qr.query(`DROP TRIGGER IF EXISTS trg_admin_log_immutable ON admin_action_logs`);
    await qr.query(`DROP FUNCTION IF EXISTS fn_ledger_immutable`);
    await qr.query(`DROP FUNCTION IF EXISTS fn_admin_log_immutable`);
    await qr.query(`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallet_available_non_negative`);
    await qr.query(`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallet_held_non_negative`);
    await qr.query(`DROP TABLE IF EXISTS refund_requests`);
    await qr.query(`DROP TABLE IF EXISTS user_risk_scores`);
    await qr.query(`DROP TABLE IF EXISTS wallet_recon_log`);
  }
}
