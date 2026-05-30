import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v6 (P2): enable pg_trgm + create GIN trigram indexes for the social search
 * surface. Replaces the previous `LIKE '%term%'` full-table scan with a
 * sub-millisecond index lookup at 10M+ users.
 *
 * Indexed columns (case-folded via LOWER):
 *   users.username, users.display_name, users.name
 *
 * Once this migration is in, SocialService.searchCommunityUsers uses the
 * trigram similarity operator (`%`) instead of LIKE.
 */
export class PgTrgmSearchIndex1700000000043 implements MigrationInterface {
  name = 'PgTrgmSearchIndex1700000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // GIN trigram indexes — use CONCURRENTLY in a separate manual migration
    // if you're applying to a populated database. The IF NOT EXISTS guard
    // keeps re-runs idempotent.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username_trgm
        ON users USING gin (LOWER(username) gin_trgm_ops)
        WHERE username IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm
        ON users USING gin (LOWER(display_name) gin_trgm_ops)
        WHERE display_name IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_name_trgm
        ON users USING gin (LOWER(name) gin_trgm_ops)
        WHERE name IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_display_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_username_trgm`);
    // Don't drop the extension — other features may use it.
  }
}
