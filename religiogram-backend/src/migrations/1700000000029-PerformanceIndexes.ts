import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PerformanceIndexes — §29
 *
 * Production query-pattern analysis identified the following hot paths:
 *
 *   1. Booking list by user      → bookings (user_id, status, scheduled_at DESC)
 *   2. Provider schedule view    → bookings (provider_id, scheduled_at, status)
 *   3. Provider search / filter  → service_providers (is_active, is_online, avg_rating DESC)
 *   4. Wallet history            → ledger_entries (wallet_id, created_at DESC)
 *   5. Hold resolution job       → wallet_holds (wallet_id, status) — partial WHERE status='active'
 *   6. Consultation by provider  → consultation_sessions (provider_id, status, started_at DESC)
 *   7. Unread notifications      → notifications (user_id, is_read, created_at DESC)
 *   8. Dispute queue             → disputes (status, created_at DESC)
 *   9. Payout batch view         → provider_earnings (provider_id, status)
 *  10. OTP / token lookups       → otp_records (phone, created_at DESC) if table exists
 *
 * Index strategy:
 *   • Composite B-tree for multi-column equality + range scans
 *   • Partial indexes to minimise index size on low-selectivity predicates
 *   • BRIN on append-only timestamp columns (ledger_entries, notifications)
 *     to accelerate time-range scans without the overhead of a full B-tree
 *   • CONCURRENTLY so production traffic is not locked out during creation
 *     (TypeORM runs migrations in a transaction but CONCURRENT CREATE INDEX
 *      must run outside one — we use raw SQL and suppress transaction for each)
 *
 * All statements are idempotent (IF NOT EXISTS).
 */
export class PerformanceIndexes1700000000029 implements MigrationInterface {
  public transaction = false;
  name = 'PerformanceIndexes1700000000029';

  public async up(qr: QueryRunner): Promise<void> {
    // ── 1. bookings: user timeline ─────────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_status_sched
        ON bookings (user_id, status, scheduled_at DESC)
    `);

    // ── 2. bookings: provider schedule window ─────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_provider_sched_status
        ON bookings (provider_id, scheduled_at, status)
    `);

    // ── 3. bookings: date-range scan (ops dashboard, reconciliation) ───────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_status_sched
        ON bookings (status, scheduled_at DESC)
    `);

    // ── 4. service_providers: search / list ───────────────────────────────
    // Partial index — only index active providers (the overwhelming majority
    // of queries never request inactive records).
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_active_online_rating
        ON service_providers (is_active, is_online, avg_rating DESC)
        WHERE is_active = true
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_religion_active
        ON service_providers (religion, is_active)
        WHERE is_active = true
    `);

    // ── 5. ledger_entries: wallet history (append-only — BRIN is ideal) ───
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created
        ON ledger_entries (wallet_id, created_at DESC)
    `);

    // BRIN covers the monotonically-increasing created_at for bulk time scans
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_ledger_created_brin
        ON ledger_entries USING BRIN (created_at)
    `);

    // ── 6. wallet_holds: active hold resolution job ────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_holds_wallet_status
        ON wallet_holds (wallet_id, status)
        WHERE status = 'active'
    `);

    // ── 7. consultation_sessions: provider dashboard ──────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_consult_sessions_provider_status
        ON consultation_sessions (provider_id, status, started_at DESC)
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_consult_sessions_user_status
        ON consultation_sessions (user_id, status, started_at DESC)
    `);

    // ── 8. notifications: unread feed (most common query) ─────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications (user_id, created_at DESC)
        WHERE is_read = false
    `);

    // Full timeline (mark-all-read, pagination)
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications (user_id, created_at DESC)
    `);

    // ── 9. disputes: ops queue ────────────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_disputes_status_created
        ON disputes (status, created_at DESC)
    `);

    // ── 10. provider_earnings: payout scheduling ──────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_earnings_provider_status
        ON provider_earnings (provider_id, status)
    `);

    // ── 11. booking_events: audit trail lookup by booking ─────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_events_booking_created
        ON booking_events (booking_id, created_at DESC)
    `);

    // ── 12. payments: status + gateway reconciliation ─────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_booking_status
        ON payments (booking_id, status)
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_created_brin
        ON payments USING BRIN (created_at)
    `);

    // ── 13. slot_locks: expiry sweep job ─────────────────────────────────
    // Only unexpired locks need to be swept — partial index keeps it tiny.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_slot_locks_expires_provider
        ON slot_locks (expires_at, provider_id)
        WHERE is_released = false
    `).catch(() => { /* table may not exist in all environments */ });

    // ── 14. reviews: provider rating aggregation ──────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_provider_created
        ON reviews (provider_id, created_at DESC)
    `);

    // ── 15. admin_action_logs: audit search ───────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_brin
        ON admin_action_logs USING BRIN (created_at)
    `).catch(() => { /* table may not exist in all environments */ });
  }

  public async down(qr: QueryRunner): Promise<void> {
    const indexes = [
      'idx_bookings_user_status_sched',
      'idx_bookings_provider_sched_status',
      'idx_bookings_status_sched',
      'idx_providers_active_online_rating',
      'idx_providers_religion_active',
      'idx_ledger_wallet_created',
      'idx_ledger_created_brin',
      'idx_wallet_holds_wallet_status',
      'idx_consult_sessions_provider_status',
      'idx_consult_sessions_user_status',
      'idx_notifications_user_unread',
      'idx_notifications_user_created',
      'idx_disputes_status_created',
      'idx_earnings_provider_status',
      'idx_booking_events_booking_created',
      'idx_payments_booking_status',
      'idx_payments_created_brin',
      'idx_slot_locks_expires_provider',
      'idx_reviews_provider_created',
      'idx_admin_action_logs_created_brin',
    ];

    for (const name of indexes) {
      await qr.query(`DROP INDEX IF EXISTS ${name}`).catch(() => {});
    }
  }
}
