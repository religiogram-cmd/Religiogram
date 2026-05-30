import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D7: Add missing FK constraints on money-path tables.
 *
 * Before this migration several critical relationships existed only as
 * application-level conventions (no DB-level enforcement):
 *
 *  - payout_batches.provider_id → service_providers.id
 *    A payout with an orphaned provider_id would silently settle to nobody.
 *
 *  - refund_requests.booking_id → bookings.id
 *    Without this, a refund could reference a deleted booking, leaving
 *    the wallet credit with no audit trail.
 *
 *  - refund_requests.user_id → users.id
 *    Similarly, an orphaned user_id means the wallet credit targets a
 *    non-existent user — a data integrity hole.
 *
 *  - ledger_entries.wallet_id → wallets.id
 *    The FK already exists in TypeORM's @ManyToOne but was not
 *    materialised in the DB if the initial migration ran without
 *    foreignKeys: true.
 *
 * All constraints use DEFERRABLE INITIALLY DEFERRED to avoid deadlocks
 * during bulk inserts inside a transaction.
 *
 * NOTE: ON DELETE RESTRICT is intentional — deleting a provider/user/booking
 * that has associated money records should be blocked, not cascaded.
 */
export class FkConstraintsMoney1700000000048 implements MigrationInterface {
  public transaction = false;
  name = 'FkConstraintsMoney1700000000048';

  async up(qr: QueryRunner): Promise<void> {
    // 1. payout_batches → service_providers
    await qr.query(`
      ALTER TABLE payout_batches
        ADD CONSTRAINT fk_payout_batches_provider
        FOREIGN KEY (provider_id)
        REFERENCES service_providers(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    `).catch(() => { /* FK may already exist */ });

    // 2. refund_requests → bookings
    await qr.query(`
      ALTER TABLE refund_requests
        ADD CONSTRAINT fk_refund_requests_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    `).catch(() => {});

    // 3. refund_requests → users
    await qr.query(`
      ALTER TABLE refund_requests
        ADD CONSTRAINT fk_refund_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    `).catch(() => {});

    // 4. ledger_entries → wallets (materialise the TypeORM @ManyToOne FK)
    await qr.query(`
      ALTER TABLE ledger_entries
        ADD CONSTRAINT fk_ledger_entries_wallet
        FOREIGN KEY (wallet_id)
        REFERENCES wallets(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    `).catch(() => {});

    // 5. payments → bookings (payment without a booking is an orphan record)
    await qr.query(`
      ALTER TABLE payments
        ADD CONSTRAINT fk_payments_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    `).catch(() => {});

    // 6. payout_batches — add index on provider_id + status for the
    //    T+2 settlement cron query (avoids sequential scan on large tables)
    await qr.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payout_batches_provider_status
        ON payout_batches(provider_id, status)
    `).catch(() => {});
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE payout_batches DROP CONSTRAINT IF EXISTS fk_payout_batches_provider`);
    await qr.query(`ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS fk_refund_requests_booking`);
    await qr.query(`ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS fk_refund_requests_user`);
    await qr.query(`ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS fk_ledger_entries_wallet`);
    await qr.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_booking`);
    await qr.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_payout_batches_provider_status`);
  }
}
