import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectnessHardening1700000000028 implements MigrationInterface {
  name = 'CorrectnessHardening1700000000028';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE payments ALTER COLUMN amount_paise TYPE bigint`);
    await qr.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount_paise bigint NOT NULL DEFAULT 0`);

    await qr.query(`ALTER TABLE provider_earnings ADD COLUMN IF NOT EXISTS payout_batch_id uuid NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_provider_earnings_payout_batch ON provider_earnings (payout_batch_id)`);

    await qr.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS valid_from timestamptz NULL`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS discount_redemptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        discount_code_id uuid NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        booking_id uuid NULL,
        redeemed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_redemptions_user_code
        ON discount_redemptions (discount_code_id, user_id)
    `);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_idempotency_key
        ON refund_requests (idempotency_key)
    `);

    await qr.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_ref uuid NULL`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_messages_session_seq
        ON consultation_messages (session_id, seq)
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS wallet_recon_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wallets_checked int NOT NULL,
        mismatches int NOT NULL,
        frozen_wallets jsonb NOT NULL DEFAULT '[]',
        recovered_holds int NOT NULL DEFAULT 0,
        duration_ms int NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS wallet_recon_log`);
    await qr.query(`DROP INDEX IF EXISTS idx_consultation_messages_session_seq`);
    await qr.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS payment_ref`);
    await qr.query(`DROP INDEX IF EXISTS idx_refund_requests_idempotency_key`);
    await qr.query(`DROP INDEX IF EXISTS idx_discount_redemptions_user_code`);
    await qr.query(`DROP TABLE IF EXISTS discount_redemptions`);
    await qr.query(`ALTER TABLE discount_codes DROP COLUMN IF EXISTS valid_from`);
    await qr.query(`DROP INDEX IF EXISTS idx_provider_earnings_payout_batch`);
    await qr.query(`ALTER TABLE provider_earnings DROP COLUMN IF EXISTS payout_batch_id`);
    await qr.query(`ALTER TABLE payments DROP COLUMN IF EXISTS refunded_amount_paise`);
    await qr.query(`ALTER TABLE payments ALTER COLUMN amount_paise TYPE int`);
  }
}
