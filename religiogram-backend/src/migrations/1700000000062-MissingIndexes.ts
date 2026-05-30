import { MigrationInterface, QueryRunner } from 'typeorm';

export class MissingIndexes1700000000062 implements MigrationInterface {
  public transaction = false;
  name = 'MissingIndexes1700000000062';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Index for releaseHoldByReference / captureHoldByReference
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_holds_ref_status
        ON wallet_holds (reference_id, status) WHERE status = 'active'
    `);

    // Index for friendships requester branch (OR query)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_requester_status
        ON friendships (requester_id, status) WHERE status = 'accepted'
    `);

    // Index for DM unread count query
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dms_recipient_unread
        ON direct_messages (recipient_id, read_at) WHERE read_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_wallet_holds_ref_status`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_friendships_requester_status`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_dms_recipient_unread`);
  }
}
