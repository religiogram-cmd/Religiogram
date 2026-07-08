import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_reports  — user-submitted moderation reports for posts / comments /
 *                 users / messages. UNIQUE(reporter, target_type, target_id)
 *                 makes double-submission from the client a no-op.
 * user_blocks   — one-way block relationship (blocker → blocked). Feed and
 *                 DM read paths filter these out (see FeedService / SocialService).
 *
 * Both tables use CREATE TABLE IF NOT EXISTS so re-running is safe on a
 * partially migrated DB.
 */
export class ReportsAndBlocks1700000000075 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() lives in pgcrypto — safe no-op if the extension is
    // already enabled by an earlier migration.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_reports (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type       varchar(20) NOT NULL,
        target_id         varchar(64) NOT NULL,
        reason            varchar(50) NOT NULL,
        details           text NULL,
        status            varchar(20) NOT NULL DEFAULT 'pending',
        created_at        timestamptz NOT NULL DEFAULT now(),
        resolved_at       timestamptz NULL,
        resolver_admin_id uuid NULL,
        CONSTRAINT ck_user_reports_target_type CHECK (target_type IN ('post','comment','user','message')),
        CONSTRAINT ck_user_reports_status      CHECK (status      IN ('pending','resolved','rejected')),
        CONSTRAINT uq_user_reports_reporter_target UNIQUE (reporter_id, target_type, target_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id, blocked_id),
        CONSTRAINT ck_user_blocks_self CHECK (blocker_id <> blocked_id)
      )
    `);
    // Reverse-lookup: "who blocks me?" — used by DM/feed filters keyed on the
    // OTHER user's row so the filter can skip conversations from users who
    // blocked the current user too.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_blocks_blocked`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_blocks`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_reports_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_reports`);
  }
}
