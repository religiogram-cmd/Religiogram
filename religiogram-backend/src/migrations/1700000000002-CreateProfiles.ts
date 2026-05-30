import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `profiles` table and adds the mirrored `profile_complete`
 * flag on `users`.
 *
 * Design notes:
 *   - `profiles.user_id` is both PK and FK → one profile per user, and
 *     a `DELETE FROM users` cascades automatically.
 *   - `data` is JSONB so wizard steps can evolve without migrations.
 *   - `completed` gets its own index for the "show resume card" query
 *     on the dashboard (`WHERE completed = false AND user_id = …`).
 *   - `users.profile_complete` lets /users/me answer without a JOIN.
 *     It's a denormalised mirror; the profiles table is the source of truth.
 *
 * Backfill:
 *   - No backfill needed for profiles — existing users start with
 *     profile_complete = false and will be asked to finish setup on
 *     their next login if product decides to surface the dashboard card
 *     retroactively.
 */
export class CreateProfiles1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. profiles table
    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "user_id"     uuid PRIMARY KEY,
        "step"        smallint NOT NULL DEFAULT 0,
        "data"        jsonb    NOT NULL DEFAULT '{}'::jsonb,
        "completed"   boolean  NOT NULL DEFAULT false,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_profiles_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_profiles_completed"
        ON "profiles" ("completed")
        WHERE completed = false
    `);

    // 2. users.profile_complete mirror
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "profile_complete" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_complete"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_profiles_completed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
  }
}
