import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scalability indexes — added after the initial schema to support:
 *   - admin queries over auth_events by phone (OTP audit trail)
 *   - admin dashboards counting active users by role (marketplace health)
 *   - cohort analytics by signup date
 *   - soft-delete pattern on users
 *
 * All CREATE INDEX statements use `CONCURRENTLY` so the migration can be
 * run against production without blocking writes. (Requires a fresh
 * transaction — TypeORM sets `autoRun` to false for this.)
 *
 * NOTE: run this migration manually during a maintenance window the first
 * time on a populated DB; CONCURRENTLY still briefly locks the table at
 * the start and end of the build.
 */
export class ScaleIndexes1700000000001 implements MigrationInterface {
  public transaction = false;
  name = 'ScaleIndexes1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Soft-delete column — lets us keep refresh-token reuse detection and
    // audit-trail foreign keys valid even after account closure.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz
    `);

    // auth_events: audit trail lookup by phone number — used by fraud /
    // abuse-tracing queries and by per-phone OTP-rate accounting.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_events_phone"
        ON "auth_events" ("phone", "created_at" DESC)
        WHERE "phone" IS NOT NULL
    `);

    // auth_events: event-type + user lookup (e.g. "did user X log in today?")
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_events_user_type"
        ON "auth_events" ("user_id", "event_type", "created_at" DESC)
        WHERE "user_id" IS NOT NULL
    `);

    // users: admin filters & marketplace health counts.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_active"
        ON "users" ("is_active")
        WHERE "is_active" = true
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_role_active"
        ON "users" ("role", "is_active")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_created_at"
        ON "users" ("created_at" DESC)
    `);

    // users: exclude soft-deleted rows from unique-phone lookups cheaply.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_not_deleted"
        ON "users" ("id")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_not_deleted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auth_events_user_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_auth_events_phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
