import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoryExpiryIndex1700000000056 implements MigrationInterface {
  public transaction = false;
  name = 'StoryExpiryIndex1700000000056';

  async up(qr: QueryRunner): Promise<void> {
    // Index for efficient story expiry cleanup
    await qr.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_expires_at
        ON stories (expires_at)
        WHERE expires_at IS NOT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_stories_expires_at`);
  }
}
