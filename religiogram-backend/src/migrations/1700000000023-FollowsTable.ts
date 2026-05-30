import { MigrationInterface, QueryRunner } from 'typeorm';

export class FollowsTable1700000000023 implements MigrationInterface {
  name = 'FollowsTable1700000000023';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE follows (
        id            BIGSERIAL    PRIMARY KEY,
        follower_id   UUID         NOT NULL,
        followee_type VARCHAR(20)  NOT NULL CHECK (followee_type IN ('provider','temple')),
        followee_id   VARCHAR(40)  NOT NULL,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT uq_follows UNIQUE (follower_id, followee_type, followee_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_follows_follower  ON follows (follower_id)`);
    await qr.query(`CREATE INDEX idx_follows_followee  ON follows (followee_type, followee_id)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS follows`);
  }
}
