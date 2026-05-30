import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityFeatures1700000000027 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // username, account_type, bio on users
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username) WHERE username IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(160)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
    );

    // hashtags and post_type on social_posts
    await queryRunner.query(
      `ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS hashtags TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS post_type VARCHAR(20) NOT NULL DEFAULT 'text'`,
    );

    // stories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_type    VARCHAR(20) NOT NULL DEFAULT 'text',
        media_url     TEXT,
        text_content  VARCHAR(300),
        background_color VARCHAR(30),
        expires_at    TIMESTAMPTZ NOT NULL,
        viewed_by     TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stories`);
    await queryRunner.query(
      `ALTER TABLE social_posts DROP COLUMN IF EXISTS hashtags`,
    );
    await queryRunner.query(
      `ALTER TABLE social_posts DROP COLUMN IF EXISTS post_type`,
    );
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS username`,
    );
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS account_type`,
    );
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS bio`);
  }
}
