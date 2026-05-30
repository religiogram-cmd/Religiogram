import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1700000000009 — Place ownership + claim workflow.
 *
 * Motivation: manual admin data entry does not scale past a few thousand
 * listings. Real custodians (a temple's priest, a mosque's imam, a church's
 * secretary) need to manage their own page. We give them a gated path:
 *
 *   1. User submits a claim on a place.
 *   2. Admin reviews evidence, approves or rejects.
 *   3. On approval, `temples.owner_id` points at the user.
 *   4. The owner can hit owner-scoped routes to edit events/services on
 *      *their* place only — enforced by OwnerOrAdminGuard reading owner_id.
 *
 * Why keep claim rows around after approval/rejection?
 *   - Audit trail. If a claim is disputed later ("this isn't my temple"),
 *     we need the original evidence + admin notes.
 *   - Reapply flow. A rejected user can submit a new claim; the history
 *     is visible to the next reviewer.
 *
 * A place can have at most ONE pending claim at a time — enforced by a
 * partial unique index. Approved/rejected claims are exempt so a rejection
 * doesn't block a future resubmission.
 */
export class CreatePlaceClaims1700000000009 implements MigrationInterface {
  name = 'CreatePlaceClaims1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. owner_id on temples ──
     *
     * Nullable — most places start unowned. An admin can assign ownership
     * directly (bypassing the claim flow) when they know the operator
     * offline. ON DELETE SET NULL so a user account deletion doesn't
     * orphan the place record itself.
     */
    await queryRunner.query(`
      ALTER TABLE temples
        ADD COLUMN IF NOT EXISTS owner_id uuid
        REFERENCES users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_temples_owner
        ON temples (owner_id)
        WHERE owner_id IS NOT NULL
    `);

    /* ── 2. claim_status enum ── */
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_status') THEN
          CREATE TYPE claim_status AS ENUM (
            'pending',
            'approved',
            'rejected',
            'withdrawn'
          );
        END IF;
      END$$;
    `);

    /* ── 3. place_claims ──
     *
     * Evidence is a free-text blob for MVP — typically "I am the head
     * priest, here is my trust registration number" plus a URL or two.
     * When we ship file uploads for claim evidence we'll add an
     * `evidence_upload_ids uuid[]` column that FKs into `uploads`.
     *
     * reviewed_by is nullable because pending claims have no reviewer.
     * ON DELETE SET NULL so an admin user deletion doesn't cascade into
     * audit history we want to preserve.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS place_claims (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id        uuid NOT NULL REFERENCES temples(id) ON DELETE CASCADE,
        user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status          claim_status NOT NULL DEFAULT 'pending',
        claim_evidence  text NOT NULL,
        contact_email   varchar(255),
        contact_phone   varchar(20),
        admin_notes     text,
        reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at     timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    /* Partial unique index: exactly one pending claim per (place, user).
     * Approved/rejected/withdrawn rows don't count so a user can retry. */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_place_claims_pending
        ON place_claims (place_id, user_id)
        WHERE status = 'pending'
    `);

    /* Dashboard indexes: admin pending queue + user's own claims. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_claims_status_created
        ON place_claims (status, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_place_claims_user_created
        ON place_claims (user_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_place_claims_user_created');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_place_claims_status_created');
    await queryRunner.query('DROP INDEX IF EXISTS UQ_place_claims_pending');
    await queryRunner.query('DROP TABLE IF EXISTS place_claims');
    await queryRunner.query('DROP TYPE IF EXISTS claim_status');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_temples_owner');
    await queryRunner.query('ALTER TABLE temples DROP COLUMN IF EXISTS owner_id');
  }
}
