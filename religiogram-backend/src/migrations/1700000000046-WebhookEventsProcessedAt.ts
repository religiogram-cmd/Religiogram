import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v11 (GAP-3 fix): the v7 webhook_events table only had `received_at`. If
 * the handler threw AFTER the INSERT succeeded, the next BullMQ retry saw
 * the row as already-present and skipped processing — silently losing the
 * webhook side effect. processed_at is set ONLY after the handler succeeds,
 * so a mid-handler failure leaves the row claim-able by the next retry.
 */
export class WebhookEventsProcessedAt1700000000046 implements MigrationInterface {
  name = 'WebhookEventsProcessedAt1700000000046';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE webhook_events
        ADD COLUMN IF NOT EXISTS processed_at timestamptz
    `);
    // Existing rows are assumed already-processed (they predate this fix);
    // backfill with received_at so the new claim-WHERE skips them.
    await qr.query(`
      UPDATE webhook_events
         SET processed_at = received_at
       WHERE processed_at IS NULL
    `);
    // Index for the un-processed-row claim query.
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
        ON webhook_events (received_at)
        WHERE processed_at IS NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_webhook_events_unprocessed`);
    await qr.query(`ALTER TABLE webhook_events DROP COLUMN IF EXISTS processed_at`);
  }
}
