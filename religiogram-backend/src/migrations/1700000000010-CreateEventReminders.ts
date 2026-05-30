import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1700000000010 — "Remind me" subscriptions on place events.
 *
 * This is the engagement loop for events: instead of a static list the
 * user scans once and forgets, a tap turns it into a scheduled notification.
 * Most real value lives in this layer — not the event list itself.
 *
 * Data model:
 *   - event_reminders.event_id   → place_events.id (CASCADE delete if the
 *                                  event is removed; no orphan reminders)
 *   - event_reminders.user_id    → users.id (CASCADE delete if the user
 *                                  removes their account)
 *   - remind_at timestamptz      → the exact moment to dispatch. Computed
 *                                  at subscribe time from event.start_time
 *                                  minus a lead-time (default 1 h before).
 *   - sent boolean               → dispatcher marks true after a successful
 *                                  notification push. Idempotent: the
 *                                  dispatch job picks rows WHERE sent=false.
 *   - status                     → 'scheduled' | 'cancelled' | 'sent'.
 *                                  Kept explicit in addition to `sent` so
 *                                  a cancel (user unsubscribes) is
 *                                  distinguishable from a permanent
 *                                  "won't send — past due".
 *
 * Indexes tuned for three hot queries:
 *   - UNIQUE (event_id, user_id)            → "have I already subscribed?"
 *   - (remind_at) WHERE status='scheduled'  → dispatcher scan (the big one)
 *   - (user_id, remind_at DESC)             → "my upcoming reminders"
 */
export class CreateEventReminders1700000000010 implements MigrationInterface {
  name = 'CreateEventReminders1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_status') THEN
          CREATE TYPE reminder_status AS ENUM (
            'scheduled',
            'sent',
            'cancelled',
            'failed'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_reminders (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id   uuid NOT NULL REFERENCES place_events(id) ON DELETE CASCADE,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        remind_at  timestamptz NOT NULL,
        status     reminder_status NOT NULL DEFAULT 'scheduled',
        sent       boolean NOT NULL DEFAULT false,
        sent_at    timestamptz,
        error      text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    /* One active reminder per user per event. A user can re-subscribe
     * only after cancellation — enforced by the partial unique below. */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_event_reminders_active
        ON event_reminders (event_id, user_id)
        WHERE status = 'scheduled'
    `);

    /* Dispatcher hot path: "what's due in the next minute?"
     * Partial index on scheduled-only keeps the B-tree tight even when
     * sent/cancelled rows pile up. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_event_reminders_due
        ON event_reminders (remind_at)
        WHERE status = 'scheduled' AND sent = false
    `);

    /* User's own "my reminders" list. */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_event_reminders_user_remind
        ON event_reminders (user_id, remind_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IDX_event_reminders_user_remind');
    await queryRunner.query('DROP INDEX IF EXISTS IDX_event_reminders_due');
    await queryRunner.query('DROP INDEX IF EXISTS UQ_event_reminders_active');
    await queryRunner.query('DROP TABLE IF EXISTS event_reminders');
    await queryRunner.query('DROP TYPE IF EXISTS reminder_status');
  }
}
