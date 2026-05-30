import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-series schema correctness fixes (PDF audit §D1-D6).
 *
 * D1  user_files.status check constraint only allowed 'pending','confirmed',
 *     'expired'. The entity adds 'scanned' and 'quarantined' so the virus-scan
 *     processor has always been writing values that violate the DB constraint.
 *     Fix: drop + recreate the constraint with the full set.
 *
 * D2  refund_requests: no index on (booking_id) or (user_id). Every
 *     cancellation flow does a point-lookup on booking_id; without an index
 *     this is a seqscan on an unbounded table.
 *
 * D3  booking_addons, slot_locks: FK columns added in migration 026 without
 *     backing indexes (TypeORM does not auto-create FK indexes in raw SQL).
 *
 * D4  dispute_events: FK on dispute_id has no index.
 *
 * D5  verification_documents + verification_submissions: FK columns without
 *     indexes. Admin verification queue does point-lookups on submission_id.
 *
 * D6  ai_birth_profiles: user_id FK without index (every chat load fetches
 *     the birth profile by user_id — full seqscan at scale).
 *
 * All index creates use IF NOT EXISTS so this migration is re-runnable.
 */
export class SchemaCorrectness1700000000047 implements MigrationInterface {
  name = 'SchemaCorrectness1700000000047';

  public async up(qr: QueryRunner): Promise<void> {
    // ─── D1: user_files.status ────────────────────────────────────────────────
    // Drop old constraint (name from CreateUserFiles migration)
    await qr.query(`
      ALTER TABLE user_files
        DROP CONSTRAINT IF EXISTS "CHK_user_files_status"
    `);
    // Re-add with full status set used by the application
    await qr.query(`
      ALTER TABLE user_files
        ADD CONSTRAINT "CHK_user_files_status"
          CHECK (status IN (
            'pending','confirmed','expired','scanned','quarantined'
          ))
    `);

    // ─── D2: refund_requests ─────────────────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refund_requests_booking_id"
        ON refund_requests (booking_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refund_requests_user_id"
        ON refund_requests (user_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refund_requests_state"
        ON refund_requests (state)
        WHERE state NOT IN ('completed','rejected')
    `);

    // ─── D3: booking_addons + slot_locks ─────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_addons_booking_id"
        ON booking_addons (booking_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_slot_locks_booking_id"
        ON slot_locks (booking_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_slot_locks_provider_slot"
        ON slot_locks (provider_id, slot_time)
        WHERE expires_at > now()
    `);

    // ─── D4: dispute_events ───────────────────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dispute_events_dispute_id"
        ON dispute_events (dispute_id)
    `);

    // ─── D5: verification tables ──────────────────────────────────────────────
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verification_docs_submission_id"
        ON verification_documents (submission_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verification_queue_submission_id"
        ON verification_review_queue (submission_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_verification_submissions_user_id"
        ON verification_submissions (user_id)
    `);

    // ─── D6: ai_birth_profiles ────────────────────────────────────────────────
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_birth_profiles_user_id"
        ON ai_birth_profiles (user_id)
    `);

    // ─── Extra: ledger_entries direction partial index (reconciliation) ────────
    // Reconciliation SUM(amount * direction) per wallet_id — composite helps
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_wallet_direction"
        ON ledger_entries (wallet_id, direction)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_ledger_wallet_direction"`);
    await qr.query(`DROP INDEX IF EXISTS "UQ_ai_birth_profiles_user_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_verification_submissions_user_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_verification_queue_submission_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_verification_docs_submission_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_dispute_events_dispute_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_slot_locks_provider_slot"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_slot_locks_booking_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_booking_addons_booking_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_refund_requests_state"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_refund_requests_user_id"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_refund_requests_booking_id"`);

    // Revert status constraint to original (removes scanned/quarantined)
    await qr.query(`
      ALTER TABLE user_files
        DROP CONSTRAINT IF EXISTS "CHK_user_files_status"
    `);
    await qr.query(`
      ALTER TABLE user_files
        ADD CONSTRAINT "CHK_user_files_status"
          CHECK (status IN ('pending','confirmed','expired'))
    `);
  }
}
