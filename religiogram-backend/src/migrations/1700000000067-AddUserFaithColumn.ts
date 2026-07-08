import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.faith` — the user-declared religion preference used to face
 * the Holy Places browser + the Priests marketplace.
 *
 * The column was originally created implicitly by TypeORM `synchronize`
 * during development, but this migration file was shipped with EMPTY
 * `up()`/`down()` bodies. That meant the column's existence in production
 * silently depended on `synchronize: true` still being on at deploy time —
 * a footgun. This rewrite makes the schema change explicit and idempotent
 * so it survives the eventual `synchronize: false` switch.
 *
 * Allowed values (enforced only in the UI + DTO layer, not with a CHECK
 * constraint so we can add faiths without a migration):
 *   'all' | 'hindu' | 'muslim' | 'sikh' | 'christian'
 */
export class AddUserFaithColumn1700000000067 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    // Idempotent: only add if the column is missing (older TypeORM synchronize
    // runs may have already created it).
    const [{ exists }] = await q.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'faith'
      ) AS exists
    `);
    if (!exists) {
      await q.query(`ALTER TABLE users ADD COLUMN faith varchar(20) NULL`);
    }

    // Backfill from the JSONB profile if present. profiles.data.religion is
    // where the old /profile PATCH endpoint has been writing the same value;
    // this reconciles the two sources of truth in favour of the column.
    await q.query(`
      UPDATE users u
      SET faith = LOWER(p.data->>'religion')
      FROM profiles p
      WHERE p.user_id = u.id
        AND u.faith IS NULL
        AND p.data ? 'religion'
        AND p.data->>'religion' IS NOT NULL
    `);

    // Cheap lookup index — Places + Priests both filter on this.
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_users_faith
      ON users (faith)
      WHERE faith IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_users_faith`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS faith`);
  }
}
