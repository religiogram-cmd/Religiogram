import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates notifications and device_tokens tables.
 *
 * Performance notes:
 *  - idx_notifications_user_created uses DESC so ORDER BY created_at DESC
 *    index scans use the index directly without a filesort.
 *  - Partial index idx_notifications_user_unread (WHERE is_read = FALSE)
 *    keeps the "unread count" query sub-millisecond even for users with
 *    thousands of historical notifications.
 *  - device_tokens has a UNIQUE constraint on token — handles FCM token
 *    re-registration (device switch / app reinstall) cleanly via upsert.
 */
export class NotificationsSchema1700000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── notifications ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID         NOT NULL,
        type       VARCHAR(50)  NOT NULL,
        title      VARCHAR(200) NOT NULL,
        body       TEXT         NOT NULL,
        data       JSONB,
        is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
        read_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications(user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, is_read)
        WHERE is_read = FALSE
    `);

    // ── device_tokens ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID         NOT NULL,
        token      VARCHAR(500) NOT NULL,
        platform   VARCHAR(20)  NOT NULL,
        is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_device_token UNIQUE(token)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_tokens_user
        ON device_tokens(user_id, platform)
    `);

    // Auto-update updated_at on device_tokens
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION device_tokens_set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON device_tokens;
      CREATE TRIGGER trg_device_tokens_updated_at
        BEFORE UPDATE ON device_tokens
        FOR EACH ROW EXECUTE FUNCTION device_tokens_set_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_tokens CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS device_tokens_set_updated_at CASCADE`);
  }
}
