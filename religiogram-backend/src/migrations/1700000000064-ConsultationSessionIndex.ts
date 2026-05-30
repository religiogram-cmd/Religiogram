import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 064 — Index on consultation_sessions (user_id, session_status)
 *
 * WHY THIS INDEX IS CRITICAL:
 *   consultation-intro.service.ts `isCashbackEligible()` runs:
 *     SELECT COUNT(*) FROM consultation_sessions
 *     WHERE user_id = $1 AND session_status = 'ended'
 *   on every session end call.  Without an index this is a sequential scan
 *   across potentially hundreds-of-thousands of rows at scale.
 *
 *   At 100 000 completed sessions and 10 000 req/min end calls this single
 *   missing index would be the top slow-query on the DB at peak load.
 *
 * SAFE: CREATE INDEX CONCURRENTLY — no table lock, zero downtime.
 * REQUIRES: transaction = false (Postgres constraint on CONCURRENTLY).
 */
export class ConsultationSessionIndex1700000000064 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Primary index: cashback eligibility query (user_id + status filter)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        "IDX_consultation_sessions_user_status"
        ON "consultation_sessions" ("user_id", "session_status")
    `);

    // Secondary index: provider earnings query (provider_id + status = 'ended')
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        "IDX_consultation_sessions_provider_status"
        ON "consultation_sessions" ("provider_id", "session_status")
    `);

    // Partial index on active sessions (session_status = 'active') — used by billing
    // recovery SCAN in consultation-billing.service.ts onModuleInit
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS
        "IDX_consultation_sessions_active"
        ON "consultation_sessions" ("session_status")
        WHERE session_status = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_consultation_sessions_active"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_consultation_sessions_provider_status"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_consultation_sessions_user_status"`);
  }
}
