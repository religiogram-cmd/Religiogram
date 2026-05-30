import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates bookings and payments tables.
 *
 * Design decisions:
 *  - amount stored in paise (INT) to avoid floating-point precision issues.
 *  - idempotency_key UNIQUE on both tables prevents duplicate rows from
 *    retried requests without application-level dedup logic.
 *  - Partial unique indexes on razorpay_order_id / razorpay_payment_id match
 *    the TypeORM entity definition and handle NULL values correctly (NULL ≠ NULL
 *    in SQL so a plain unique index would pass multiple NULLs).
 *  - Enums stored as VARCHAR for portability; application layer enforces valid
 *    values via class-validator and TypeORM enum type.
 *  - providers.id is BIGINT (see CreateServiceProviders migration) so
 *    provider_id here is BIGINT.
 */
export class BookingsPayments1700000000015 implements MigrationInterface {
  name = 'BookingsPayments1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── bookings ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id"                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"             UUID          NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "provider_id"         BIGINT        NOT NULL REFERENCES "providers"("id") ON DELETE RESTRICT,
        "service_name"        VARCHAR(200)  NOT NULL,
        "service_id"          UUID,
        "type"                VARCHAR(20)   NOT NULL DEFAULT 'online',
        "status"              VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "scheduled_at"        TIMESTAMPTZ   NOT NULL,
        "duration_minutes"    INT           NOT NULL DEFAULT 60,
        "amount_paise"        INT           NOT NULL,
        "currency"            CHAR(3)       NOT NULL DEFAULT 'INR',
        "notes"               TEXT,
        "cancellation_reason" TEXT,
        "idempotency_key"     VARCHAR(64)   NOT NULL,
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_bookings_idempotency_key" UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_bookings_user_status" ON "bookings" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_provider_scheduled" ON "bookings" ("provider_id", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_scheduled_at" ON "bookings" ("scheduled_at")`,
    );

    // ── payments ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id"           UUID          NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
        "user_id"              UUID          NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "status"               VARCHAR(20)   NOT NULL DEFAULT 'created',
        "amount_paise"         INT           NOT NULL,
        "currency"             CHAR(3)       NOT NULL DEFAULT 'INR',
        "razorpay_order_id"    VARCHAR(100),
        "razorpay_payment_id"  VARCHAR(100),
        "razorpay_signature"   VARCHAR(200),
        "failure_reason"       TEXT,
        "refund_id"            VARCHAR(100),
        "idempotency_key"      VARCHAR(64)   NOT NULL,
        "webhook_payload"      JSONB,
        "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_payments_idempotency_key" UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_payments_booking_id" ON "payments" ("booking_id")`,
    );
    // Partial unique indexes: NULL values are excluded so the constraint only
    // applies to rows where the Razorpay IDs have been populated.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_payments_razorpay_order" ON "payments" ("razorpay_order_id") WHERE "razorpay_order_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_payments_razorpay_payment" ON "payments" ("razorpay_payment_id") WHERE "razorpay_payment_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
  }
}
