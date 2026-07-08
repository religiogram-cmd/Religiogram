import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notification_prefs — per-user notification channel preferences.
 *
 * One row per user (PK = user_id). Missing row is treated as defaults
 * (push/email/sms enabled, marketing disabled, no DND window). This lets
 * NotificationsService.send() gate FCM dispatch on push_enabled + DND
 * without a mandatory upsert on registration.
 *
 * Idempotent via IF NOT EXISTS so re-running migrations on a partially
 * migrated DB is safe.
 */
export class NotificationPrefs1700000000074 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_prefs (
        user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        push_enabled      boolean NOT NULL DEFAULT true,
        email_enabled     boolean NOT NULL DEFAULT true,
        sms_enabled       boolean NOT NULL DEFAULT true,
        marketing_enabled boolean NOT NULL DEFAULT false,
        dnd_start_hour    smallint NULL,
        dnd_end_hour      smallint NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_notification_prefs_dnd_start
          CHECK (dnd_start_hour IS NULL OR (dnd_start_hour BETWEEN 0 AND 23)),
        CONSTRAINT ck_notification_prefs_dnd_end
          CHECK (dnd_end_hour   IS NULL OR (dnd_end_hour   BETWEEN 0 AND 23))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_prefs`);
  }
}
