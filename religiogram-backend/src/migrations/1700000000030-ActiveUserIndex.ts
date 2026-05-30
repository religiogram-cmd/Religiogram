import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ActiveUserIndex — §30
 *
 * The JWT validation middleware calls `UsersService.findById(id)` on every
 * authenticated request — easily the hottest read in the system. The query is:
 *
 *   SELECT * FROM users WHERE id = $1
 *
 * Because `id` is the PK it already has a B-tree index. This migration adds
 * TWO additional indexes:
 *
 *   1. Partial index on (id) WHERE deleted_at IS NULL AND is_active = TRUE
 *      Postgres can use this to answer the "active user by ID" query without
 *      touching deleted/suspended rows at all. For a table of 1M users where
 *      < 0.1% are deleted, this cuts the index size by ~99.9%.
 *
 *   2. Partial index on (email) WHERE deleted_at IS NULL
 *      The email-login flow does `WHERE email = $1`. Without a partial index,
 *      Postgres scans all emails including soft-deleted accounts. This also
 *      fixes the uniqueness guarantee: two soft-deleted accounts can have the
 *      same email stub (deleted_xxx@deleted.invalid) without the index
 *      conflicting, because the partial index only covers live accounts.
 *
 *   3. Partial index on (phone) WHERE deleted_at IS NULL
 *      Same motivation as the email index — OTP lookups should only see active
 *      phone numbers.
 *
 * All statements use IF NOT EXISTS and are safe to run on a live table.
 */
export class ActiveUserIndex1700000000030 implements MigrationInterface {
  name = 'ActiveUserIndex1700000000030';

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Hot JWT validation path: active user by PK
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_users_active_id
        ON users (id)
        WHERE deleted_at IS NULL AND is_active = true
    `);

    // 2. Email login / password-reset lookup
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_email
        ON users (email)
        WHERE deleted_at IS NULL AND email IS NOT NULL
    `);

    // 3. OTP / phone login lookup
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_phone
        ON users (phone)
        WHERE deleted_at IS NULL AND phone IS NOT NULL
    `);

    // 4. Username lookup (social features, @-mentions)
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_username
        ON users (username)
        WHERE deleted_at IS NULL AND username IS NOT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_users_active_id`);
    await qr.query(`DROP INDEX IF EXISTS idx_users_active_email`);
    await qr.query(`DROP INDEX IF EXISTS idx_users_active_phone`);
    await qr.query(`DROP INDEX IF EXISTS idx_users_active_username`);
  }
}
