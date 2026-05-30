import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v11 (GAP-2 fix): hard-stop double-booking at the DB layer.
 *
 * The application's pessimistic-write COUNT lock did NOT prevent two
 * concurrent INSERTs for the same provider+slot when no existing bookings
 * existed — FOR UPDATE on a 0-row COUNT locks nothing.
 *
 * Postgres EXCLUDE USING gist with a tstzrange + provider_id makes the
 * DB itself reject the second INSERT with errcode 23P01 (exclusion_violation),
 * which the global exception filter maps to HTTP 409 Conflict — exactly the
 * UX we want for "slot is already taken".
 *
 * Requires the btree_gist extension to combine a bigint (provider_id =)
 * with a tstzrange (&&) in the same EXCLUDE.
 */
export class BookingsNoOverlapConstraint1700000000045 implements MigrationInterface {
  name = 'BookingsNoOverlapConstraint1700000000045';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // Generated column — Postgres maintains the tstzrange automatically.
    await qr.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS slot_range tstzrange GENERATED ALWAYS AS (
          tstzrange(
            scheduled_at,
            scheduled_at + (duration_minutes * interval '1 minute'),
            '[)'
          )
        ) STORED
    `);

    // Drop the constraint first if it exists (re-run safety).
    await qr.query(`
      ALTER TABLE bookings
        DROP CONSTRAINT IF EXISTS bookings_no_overlap
    `);

    // EXCLUDE: for the same provider_id, no two ACTIVE bookings may have
    // overlapping slot_range. CANCELLED / REFUNDED / PAYMENT_FAILED are
    // excluded so cancelled bookings free up the slot.
    await qr.query(`
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (
          provider_id WITH =,
          slot_range  WITH &&
        )
        WHERE (status NOT IN ('cancelled','refunded','payment_failed'))
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap`);
    await qr.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS slot_range`);
  }
}
