import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Provider bank-account verification scaffold.
 *
 * Adds three columns to `provider_bank_accounts` so BankVerificationService
 * can persist the outcome of the RazorpayX contact + fund_account creation
 * step and the eventual webhook-driven verification result:
 *
 *   verification_status         — already exists on the entity; ensure the
 *                                 column exists and widen the allowed values
 *                                 to include 'pending' and 'skipped' (both
 *                                 used by the scaffold flow).
 *   verification_attempted_at   — last time we tried to run the penny-drop
 *                                 (RazorpayX API call), null before any
 *                                 attempt.
 *   razorpay_fund_account_id    — the fa_XXXXXX id RazorpayX returns after
 *                                 POST /v1/fund_accounts; used for payout
 *                                 requests + to correlate the webhook.
 *
 * Idempotent: all ALTER TABLE statements use IF NOT EXISTS so re-running
 * on a partially migrated DB is safe.
 */
export class BankVerification1700000000076 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // `verification_status` may or may not already exist depending on how
    // early the deploy grabbed the entity; ADD COLUMN IF NOT EXISTS covers
    // both greenfield and pre-populated deploys.
    await queryRunner.query(`
      ALTER TABLE provider_bank_accounts
        ADD COLUMN IF NOT EXISTS verification_status       varchar(20)  NOT NULL DEFAULT 'unverified',
        ADD COLUMN IF NOT EXISTS verification_attempted_at timestamptz  NULL,
        ADD COLUMN IF NOT EXISTS razorpay_fund_account_id  varchar(64)  NULL
    `);

    // Cheap lookup for the ops "who still needs verification?" dashboard
    // and for the scheduled retry sweep (future work).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pba_verification_status
        ON provider_bank_accounts (verification_status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pba_verification_status`);
    await queryRunner.query(`
      ALTER TABLE provider_bank_accounts
        DROP COLUMN IF EXISTS razorpay_fund_account_id,
        DROP COLUMN IF EXISTS verification_attempted_at
    `);
    // verification_status is intentionally NOT dropped — the entity has it
    // as a NOT NULL column and rolling back would risk data loss on rows
    // populated by the app between deploys.
  }
}
