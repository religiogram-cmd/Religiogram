import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 033 — Bookings & ledger_entries performance indexes
 *
 * bookings:
 *   idx_bookings_user_status_sched  — composite on (user_id, status, scheduled_at DESC)
 *     Used by: GET /bookings?status=... per-user tab queries (most selective path)
 *   idx_bookings_sched_brin         — BRIN on scheduled_at
 *     Used by: admin date-range reports; very cheap to maintain on append-heavy table
 *
 * ledger_entries:
 *   idx_ledger_wallet_created       — composite on (wallet_id, created_at DESC)
 *     Used by: GET /wallet/transactions — fetches last N entries for a given wallet
 */
export class BookingsLedgerIndex1700000000033 implements MigrationInterface {
  public transaction = false;
  name = 'BookingsLedgerIndex1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── bookings ─────────────────────────────────────────────────────────────

    // Composite: user_id + status + scheduled_at DESC
    // Powers the per-tab booking list with a single index scan; covers the
    // ORDER BY scheduled_at DESC without an additional sort step.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_user_status_sched
        ON bookings (user_id, status, scheduled_at DESC)
    `);

    // BRIN on scheduled_at for admin date-range queries.
    // Very small on-disk footprint; effective because rows are largely
    // inserted in time order.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_sched_brin
        ON bookings USING BRIN (scheduled_at)
    `);

    // ── ledger_entries ────────────────────────────────────────────────────────

    // Composite: wallet_id + created_at DESC
    // Powers GET /wallet/transactions for a given user wallet with a
    // single range scan and no extra sort.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_wallet_created
        ON ledger_entries (wallet_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_ledger_wallet_created`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_sched_brin`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_user_status_sched`);
  }
}
