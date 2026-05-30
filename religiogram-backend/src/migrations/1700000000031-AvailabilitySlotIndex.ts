import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AvailabilitySlotIndex — §31
 *
 * Targets two hot read paths in the slot-reservation flow:
 *
 *   1. Provider availability look-up
 *      When a user opens a provider's booking calendar the backend runs:
 *
 *        SELECT * FROM provider_availability
 *        WHERE provider_id = $1
 *          AND day_of_week = $2
 *          AND is_active   = true
 *
 *      A composite index on (provider_id, day_of_week) with a WHERE predicate
 *      on is_active=true satisfies this query with an index-only scan.
 *
 *   2. Slot-lock expiry check (race-safe reservation)
 *      Every booking attempt first checks for an unexpired lock:
 *
 *        SELECT * FROM slot_locks
 *        WHERE slot_id    = $1
 *          AND expires_at  > NOW()
 *          AND released_at IS NULL
 *
 *      A partial index on (slot_id, expires_at) WHERE released_at IS NULL
 *      covers only live, unreleased locks — typically < 0.1% of all rows
 *      once old locks are expired. This avoids scanning historical locks on
 *      every reservation attempt.
 *
 *   3. Provider overrides look-up
 *      Calendar rendering queries overrides by provider + date range:
 *
 *        SELECT * FROM provider_availability_overrides
 *        WHERE provider_id  = $1
 *          AND override_date >= $2
 *          AND override_date <= $3
 *
 *      A composite index on (provider_id, override_date) keeps this fast even
 *      with years of override history.
 *
 * All statements use IF NOT EXISTS and are safe to run on a live table.
 */
export class AvailabilitySlotIndex1700000000031 implements MigrationInterface {
  name = 'AvailabilitySlotIndex1700000000031';

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Provider availability: weekly schedule look-up
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_avail_provider_day
        ON provider_availability (provider_id, day_of_week)
        WHERE is_active = true
    `);

    // 2. Slot locks: live-lock check (race-safe reservation critical path)
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_slot_locks_live
        ON slot_locks (slot_id, expires_at)
        WHERE released_at IS NULL
    `);

    // 3. Provider availability overrides: calendar date-range look-up
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_provider_avail_overrides_provider_date
        ON provider_availability_overrides (provider_id, override_date)
    `);

    // 4. Consultation sessions: active sessions per provider
    //    Used by the billing engine to check whether a provider is mid-session.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_sessions_provider_active
        ON consultation_sessions (provider_id, started_at)
        WHERE ended_at IS NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_provider_avail_provider_day`);
    await qr.query(`DROP INDEX IF EXISTS idx_slot_locks_live`);
    await qr.query(`DROP INDEX IF EXISTS idx_provider_avail_overrides_provider_date`);
    await qr.query(`DROP INDEX IF EXISTS idx_consultation_sessions_provider_active`);
  }
}
