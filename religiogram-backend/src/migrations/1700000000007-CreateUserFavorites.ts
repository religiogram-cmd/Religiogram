import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `user_favorites` join table — the "⭐ bookmark" retention
 * feature that complements the client-side Recently Viewed strip.
 *
 * Shape
 * -----
 *   (user_id, temple_id) — composite PK. No surrogate UUID; the
 *   pair IS the identity. This gives us free uniqueness and a
 *   natural lookup path for both "user's favorites" and "who has
 *   favourited this temple" queries without extra indexes.
 *
 * Indexes
 * -------
 *   The PK itself indexes (user_id, temple_id) in that order, which is
 *   the common read path ("list my favorites"). We add an inverse
 *   index on (temple_id) for the future "top temples by favorites"
 *   product query — cheap to have, easy to drop later if unused.
 *
 * Foreign keys
 * ------------
 *   ON DELETE CASCADE on both columns — if a user deletes their
 *   account or a temple is removed, dangling favorites disappear
 *   automatically. Keeps the table consistent without application code.
 *
 * Why not a JSONB column on users?
 *   - Favorites grow unbounded; a JSONB array would bloat the users
 *     table and force rewrites of the entire row on every toggle.
 *   - Joining to the temples table to return full rich cards is trivial
 *     with a real table, painful with a JSONB array.
 */
export class CreateUserFavorites1700000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_favorites" (
        "user_id"    uuid NOT NULL,
        "temple_id"  uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_favorites" PRIMARY KEY ("user_id", "temple_id"),
        CONSTRAINT "FK_user_favorites_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_favorites_temple"
          FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE CASCADE
      )
    `);

    // Inverse lookup: "how many users have favourited this temple?"
    // Also lets us show "❤ 1.2k saves" on the card in a later iteration.
    await queryRunner.query(`
      CREATE INDEX "IDX_user_favorites_temple"
        ON "user_favorites" ("temple_id")
    `);

    // Per-user sort by recency — the list page shows newest-first.
    await queryRunner.query(`
      CREATE INDEX "IDX_user_favorites_user_created"
        ON "user_favorites" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_favorites_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_favorites_temple"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_favorites"`);
  }
}
