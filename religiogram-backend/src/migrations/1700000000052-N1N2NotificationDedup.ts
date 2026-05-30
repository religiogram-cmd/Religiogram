import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * N1 — Notification deduplication
 *   - Add dedup_key VARCHAR(128) column to notifications table.
 *   - Partial unique index on (user_id, type, dedup_key) WHERE dedup_key IS NOT NULL.
 *     This prevents duplicate notifications for the same event without
 *     blocking rows that don't supply a dedup key.
 *
 * N2 — Transactional outbox table
 *   - Create notification_outbox table.  The application writes the notification
 *     row AND an outbox row inside the SAME database transaction.
 *     A polling job then picks up pending outbox rows and enqueues the BullMQ job,
 *     ensuring at-least-once delivery without a two-phase commit.
 */
export class N1N2NotificationDedup1700000000052 implements MigrationInterface {
  public transaction = false;
  name = 'N1N2NotificationDedup1700000000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── N1: dedup_key column ──────────────────────────────────────────── */
    await queryRunner.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(128) DEFAULT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_notifications_dedup
        ON notifications (user_id, type, dedup_key)
        WHERE dedup_key IS NOT NULL;
    `);

    /* ── N2: transactional outbox table ────────────────────────────────── */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_outbox (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID       NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        user_id       UUID         NOT NULL,
        payload       JSONB        NOT NULL,
        status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'enqueued', 'failed')),
        attempts      SMALLINT     NOT NULL DEFAULT 0,
        last_error    TEXT,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        enqueued_at   TIMESTAMPTZ
      );
    `);

    /* Index for the polling job: only unprocessed rows */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_outbox_pending
        ON notification_outbox (created_at ASC)
        WHERE status = 'pending';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_outbox;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS uq_notifications_dedup;`);
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS dedup_key;`);
  }
}
