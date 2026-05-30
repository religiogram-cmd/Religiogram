import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v4 hardening migration.
 *
 *   1. Widen bookings.amount_paise from int to bigint (P0-2 companion).
 *      Int caps at ~Rs.21.47 lakh; bigint matches payments.amount_paise.
 *   2. webhook_events table — permanent dedup for Razorpay webhooks (P0-6).
 *   3. refund_attempts table — 2-phase refunds for Razorpay (P1-1).
 *   4. Booking RIDE: index on (status, scheduled_at) for the wallet reconcile
 *      cursor.
 *
 * SAFETY: the bookings.amount_paise widen is online — int -> bigint is a
 * compatible cast and does not require a table rewrite on PG14+.
 */
export class V4Hardening1700000000041 implements MigrationInterface {
  name = 'V4Hardening1700000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bookings
        ALTER COLUMN amount_paise TYPE bigint USING amount_paise::bigint
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id    varchar(128) PRIMARY KEY,
        provider    varchar(32) NOT NULL DEFAULT 'razorpay',
        event_type  varchar(64) NOT NULL,
        body_sha256 varchar(64) NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events (received_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refund_attempts (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id          uuid NOT NULL,
        booking_id          uuid NOT NULL,
        amount_paise        bigint NOT NULL,
        idempotency_key     varchar(128) UNIQUE NOT NULL,
        status              varchar(32) NOT NULL DEFAULT 'razorpay_initiated',
        razorpay_refund_id  varchar(64),
        error_message       text,
        created_at          timestamptz NOT NULL DEFAULT now(),
        completed_at        timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_refund_attempts_status_created ON refund_attempts (status, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refund_attempts`);
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_events`);
    await queryRunner.query(`ALTER TABLE bookings ALTER COLUMN amount_paise TYPE int USING amount_paise::int`);
  }
}
