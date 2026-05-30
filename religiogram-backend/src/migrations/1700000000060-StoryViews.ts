import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoryViews1700000000060 implements MigrationInterface {
  name = 'StoryViews1700000000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS story_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (story_id, viewer_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views(viewer_id)`,
    );
    // Backfill intentionally skipped — simple-array data not reliably parseable at scale
    await queryRunner.query(`ALTER TABLE stories DROP COLUMN IF EXISTS viewed_by`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS story_views`);
    await queryRunner.query(
      `ALTER TABLE stories ADD COLUMN IF NOT EXISTS viewed_by TEXT DEFAULT ''`,
    );
  }
}
