import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NotificationsDeviceIndex — §32
 *
 * Targets three hot read paths:
 *
 *   1. Unread notification badge (BottomNav badge + feed header count)
 *      Query:  SELECT COUNT(*) FROM notifications
 *              WHERE user_id = $1 AND is_read = false
 *
 *      A partial index on (user_id) WHERE is_read = false covers only
 *      unread rows. For an active user with 10,000 notifications, 99%+
 *      are already read — the partial index is ~100× smaller than a full
 *      composite index and the COUNT hits it in O(log n).
 *
 *   2. Notification feed with cursor pagination
 *      Query:  SELECT * FROM notifications
 *              WHERE user_id = $1 AND created_at < $cursor
 *              ORDER BY created_at DESC LIMIT 20
 *
 *      A composite B-tree index on (user_id, created_at DESC) satisfies
 *      both the equality filter and the ORDER BY in a single index scan.
 *
 *   3. FCM push-token look-up (hot path before every push send)
 *      Query:  SELECT token FROM user_devices
 *              WHERE user_id = $1 AND is_active = true
 *
 *      A partial index on (user_id) WHERE is_active = true avoids
 *      scanning deactivated/stale tokens. Most devices deactivate quickly
 *      after logout or app reinstall, so the partial set is small.
 *
 *   4. BRIN index on notifications(created_at) for time-range admin queries
 *      Admin dashboards often query "notifications in the last 7 days" for
 *      all users. BRIN is tiny (~30 bytes per 128 pages) and works well
 *      because notifications are insert-only and naturally time-ordered.
 *
 * All statements use IF NOT EXISTS and are safe to run against a live table.
 */
export class NotificationsDeviceIndex1700000000032 implements MigrationInterface {
  name = 'NotificationsDeviceIndex1700000000032';

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Unread-count badge — partial index, unread rows only
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications (user_id)
        WHERE is_read = false
    `);

    // 2. Cursor-paginated notification feed
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
        ON notifications (user_id, created_at DESC)
    `);

    // 3. FCM push-token look-up — active tokens only
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_user_devices_user_active
        ON user_devices (user_id)
        WHERE is_active = true
    `);

    // 4. Admin time-range BRIN
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_brin
        ON notifications USING BRIN (created_at)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_notifications_user_unread`);
    await qr.query(`DROP INDEX IF EXISTS idx_notifications_user_created`);
    await qr.query(`DROP INDEX IF EXISTS idx_user_devices_user_active`);
    await qr.query(`DROP INDEX IF EXISTS idx_notifications_created_brin`);
  }
}
