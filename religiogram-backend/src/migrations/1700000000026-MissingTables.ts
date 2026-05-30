import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catch-up migration: creates all entity tables that have no prior
 * creation migration.  Every statement uses IF NOT EXISTS so re-running
 * is safe and idempotent.
 *
 * Dependency order (parents before children):
 *   admins → admin_action_logs
 *   religions → service_categories → catalog_services → service_add_ons
 *   religions → provider_roles
 *   bookings (existing) → booking_events / booking_addons / booking_status_history
 *   temples (existing)  → place_events / place_services
 *   users (existing)    → user_addresses / user_devices
 *   verification_submissions → verification_documents / admin_review_notes
 *   wallets → ledger_entries / wallet_holds / wallet_balances
 */
export class MissingTables1700000000026 implements MigrationInterface {
  name = 'MissingTables1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── admins ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admins" (
        "id"                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"                 VARCHAR(255)  NOT NULL,
        "password_hash"         VARCHAR(255)  NOT NULL,
        "role"                  VARCHAR(30)   NOT NULL DEFAULT 'support',
        "status"                VARCHAR(20)   NOT NULL DEFAULT 'active',
        "mfa_enabled"           BOOLEAN       NOT NULL DEFAULT FALSE,
        "mfa_secret_encrypted"  TEXT,
        "last_login_at"         TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_admins_email" UNIQUE ("email")
      )
    `);

    // ── admin_action_logs ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_action_logs" (
        "id"           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "admin_id"     UUID         REFERENCES "admins"("id") ON DELETE SET NULL,
        "action_type"  VARCHAR(50)  NOT NULL,
        "target_type"  VARCHAR(30)  NOT NULL,
        "target_id"    VARCHAR      NOT NULL,
        "payload_json" JSONB,
        "ip_address"   VARCHAR(45),
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aal_admin"  ON "admin_action_logs" ("admin_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aal_target" ON "admin_action_logs" ("target_type", "target_id")`);

    // ── availability_slots ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "availability_slots" (
        "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"  VARCHAR     NOT NULL,
        "day_of_week"  SMALLINT    NOT NULL,
        "start_time"   VARCHAR(5)  NOT NULL,
        "end_time"     VARCHAR(5)  NOT NULL,
        "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_avail_slot_provider_day" ON "availability_slots" ("provider_id", "day_of_week")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_avail_slot_provider"     ON "availability_slots" ("provider_id")`);

    // ── availability_overrides ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "availability_overrides" (
        "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"  VARCHAR     NOT NULL,
        "date"         DATE        NOT NULL,
        "is_blocked"   BOOLEAN     NOT NULL DEFAULT TRUE,
        "reason"       TEXT,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_avail_override_provider_date" ON "availability_overrides" ("provider_id", "date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_avail_override_provider"      ON "availability_overrides" ("provider_id")`);

    // ── provider_slot_locks ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_slot_locks" (
        "id"                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"              VARCHAR     NOT NULL,
        "service_id"               VARCHAR     NOT NULL,
        "slot_start"               TIMESTAMPTZ NOT NULL,
        "slot_end"                 TIMESTAMPTZ NOT NULL,
        "locked_by_user_id"        VARCHAR     NOT NULL,
        "locked_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "expires_at"               TIMESTAMPTZ NOT NULL,
        "converted_to_booking_id"  VARCHAR
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_psl_provider_slot" ON "provider_slot_locks" ("provider_id", "slot_start")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_psl_user"          ON "provider_slot_locks" ("locked_by_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_psl_expires"       ON "provider_slot_locks" ("expires_at")`);

    // ── booking_events ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking_events" (
        "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id"  UUID        NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "event_type"  VARCHAR(100) NOT NULL,
        "actor_id"    UUID,
        "actor_role"  VARCHAR(50),
        "payload"     JSONB        NOT NULL DEFAULT '{}',
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_booking_events_booking" ON "booking_events" ("booking_id")`);

    // ── booking_addons ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking_addons" (
        "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id"  UUID         NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "addon_name"  VARCHAR(200) NOT NULL,
        "amount"      BIGINT       NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ba_booking" ON "booking_addons" ("booking_id")`);

    // ── booking_status_history ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking_status_history" (
        "id"               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id"       UUID        NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "previous_status"  VARCHAR(30),
        "new_status"       VARCHAR(30) NOT NULL,
        "changed_by_type"  VARCHAR(20) NOT NULL,
        "changed_by_id"    VARCHAR,
        "reason"           TEXT,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bsh_booking" ON "booking_status_history" ("booking_id")`);

    // ── religions ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "religions" (
        "slug"            VARCHAR(50)  PRIMARY KEY,
        "display_name"    VARCHAR(100) NOT NULL,
        "icon_url"        VARCHAR,
        "theme_primary"   VARCHAR(7)   NOT NULL DEFAULT '#C8920A',
        "theme_secondary" VARCHAR(7)   NOT NULL DEFAULT '#E8B430',
        "is_active"       BOOLEAN      NOT NULL DEFAULT TRUE,
        "sort_order"      INT          NOT NULL DEFAULT 0
      )
    `);

    // ── service_categories ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_categories" (
        "id"            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "religion_slug" VARCHAR(50) NOT NULL REFERENCES "religions"("slug"),
        "name"          VARCHAR(100) NOT NULL,
        "icon"          VARCHAR,
        "sort_order"    INT          NOT NULL DEFAULT 0
      )
    `);

    // ── catalog_services ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catalog_services" (
        "id"                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "category_id"             UUID         NOT NULL REFERENCES "service_categories"("id"),
        "slug"                    VARCHAR(100) NOT NULL,
        "name"                    VARCHAR(255) NOT NULL,
        "description"             TEXT,
        "service_type"            VARCHAR      NOT NULL DEFAULT 'offline',
        "default_duration_min"    INT          NOT NULL DEFAULT 120,
        "min_price_paise"         INT          NOT NULL DEFAULT 50000,
        "max_price_paise"         INT          NOT NULL DEFAULT 500000,
        "platform_commission_pct" NUMERIC(5,2) NOT NULL DEFAULT 15.00,
        "cancellation_policy"     JSONB        NOT NULL DEFAULT '{}',
        "metadata"                JSONB        NOT NULL DEFAULT '{}',
        "is_active"               BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_catalog_services_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_catalog_services_category" ON "catalog_services" ("category_id")`);

    // ── provider_roles ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_roles" (
        "slug"                      VARCHAR(50)  PRIMARY KEY,
        "religion_slug"             VARCHAR(50)  NOT NULL REFERENCES "religions"("slug"),
        "display_name"              VARCHAR(100) NOT NULL,
        "verification_requirements" JSONB        NOT NULL DEFAULT '[]',
        "is_active"                 BOOLEAN      NOT NULL DEFAULT TRUE
      )
    `);

    // ── service_add_ons ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_add_ons" (
        "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id"  UUID         NOT NULL REFERENCES "catalog_services"("id"),
        "name"        VARCHAR(255) NOT NULL,
        "price_paise" INT          NOT NULL,
        "is_optional" BOOLEAN      NOT NULL DEFAULT TRUE
      )
    `);

    // ── consultation_sessions ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consultation_sessions" (
        "id"                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_code"          VARCHAR(20) NOT NULL,
        "user_id"               VARCHAR     NOT NULL,
        "provider_id"           VARCHAR     NOT NULL,
        "service_id"            VARCHAR     NOT NULL,
        "session_type"          VARCHAR(20) NOT NULL,
        "session_status"        VARCHAR(20) NOT NULL DEFAULT 'requested',
        "started_at"            TIMESTAMPTZ,
        "connected_at"          TIMESTAMPTZ,
        "ended_at"              TIMESTAMPTZ,
        "duration_seconds"      INT         NOT NULL DEFAULT 0,
        "billable_seconds"      INT         NOT NULL DEFAULT 0,
        "rate_per_minute"       BIGINT      NOT NULL,
        "minimum_charge_paise"  BIGINT      NOT NULL DEFAULT 0,
        "total_charge"          BIGINT      NOT NULL DEFAULT 0,
        "disconnect_reason"     VARCHAR(50),
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_consultation_sessions_code" UNIQUE ("session_code")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_csess_user"     ON "consultation_sessions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_csess_provider" ON "consultation_sessions" ("provider_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_csess_status"   ON "consultation_sessions" ("session_status")`);

    // ── consultation_events ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consultation_events" (
        "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id"   VARCHAR     NOT NULL,
        "event_type"   VARCHAR(50) NOT NULL,
        "payload_json" JSONB,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cev_session" ON "consultation_events" ("session_id")`);

    // ── session_billing_ticks ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "session_billing_ticks" (
        "id"            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id"    VARCHAR     NOT NULL,
        "tick_minute"   INT         NOT NULL,
        "amount_paise"  INT         NOT NULL,
        "wallet_tx_id"  UUID,
        "debited_at"    TIMESTAMPTZ,
        "status"        VARCHAR     NOT NULL DEFAULT 'pending',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_tick_session_minute" UNIQUE ("session_id", "tick_minute")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_billing_tick_session" ON "session_billing_ticks" ("session_id")`);

    // ── disputes ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disputes" (
        "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "dispute_ref"         VARCHAR     NOT NULL,
        "raised_by_id"        VARCHAR     NOT NULL,
        "reference_id"        VARCHAR     NOT NULL,
        "reference_type"      VARCHAR(30) NOT NULL,
        "status"              VARCHAR(30) NOT NULL DEFAULT 'raised',
        "title"               VARCHAR     NOT NULL,
        "description"         TEXT        NOT NULL,
        "evidence"            JSONB       NOT NULL DEFAULT '[]',
        "resolved_by_id"      UUID,
        "resolution_note"     TEXT,
        "refund_amount_paise" INT         NOT NULL DEFAULT 0,
        "sla_deadline"        TIMESTAMPTZ NOT NULL,
        "resolved_at"         TIMESTAMPTZ,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_disputes_ref" UNIQUE ("dispute_ref")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_raised_by"   ON "disputes" ("raised_by_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_status"       ON "disputes" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_sla_deadline" ON "disputes" ("sla_deadline")`);

    // ── dispute_messages ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_messages" (
        "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "dispute_id"   UUID        NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
        "sender_id"    VARCHAR     NOT NULL,
        "sender_role"  VARCHAR     NOT NULL,
        "message"      TEXT        NOT NULL,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_messages_dispute" ON "dispute_messages" ("dispute_id")`);

    // ── fraud_signals ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fraud_signals" (
        "id"              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"         VARCHAR     NOT NULL,
        "signal_type"     VARCHAR(50) NOT NULL,
        "risk_score"      INT         NOT NULL,
        "details"         JSONB       NOT NULL DEFAULT '{}',
        "is_resolved"     BOOLEAN     NOT NULL DEFAULT FALSE,
        "resolved_by_id"  UUID,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fraud_signals_user"     ON "fraud_signals" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fraud_signals_type"     ON "fraud_signals" ("signal_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fraud_signals_resolved" ON "fraud_signals" ("is_resolved")`);

    // ── payout_batches ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payout_batches" (
        "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"         VARCHAR     NOT NULL,
        "total_amount_paise"  INT         NOT NULL,
        "settlement_date"     DATE        NOT NULL,
        "gateway_payout_id"   VARCHAR,
        "status"              VARCHAR     NOT NULL DEFAULT 'scheduled',
        "utr_number"          VARCHAR,
        "failure_reason"      TEXT,
        "processed_at"        TIMESTAMPTZ,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_payout_batches_provider" ON "payout_batches" ("provider_id")`);

    // ── provider_earnings ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_earnings" (
        "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"         VARCHAR     NOT NULL,
        "reference_id"        VARCHAR     NOT NULL,
        "reference_type"      VARCHAR     NOT NULL,
        "gross_amount_paise"  INT         NOT NULL,
        "platform_fee_paise"  INT         NOT NULL,
        "tds_deducted_paise"  INT         NOT NULL DEFAULT 0,
        "net_amount_paise"    INT         NOT NULL,
        "status"              VARCHAR     NOT NULL DEFAULT 'pending',
        "earned_at"           TIMESTAMPTZ NOT NULL,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_provider_earnings_provider"  ON "provider_earnings" ("provider_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_provider_earnings_reference" ON "provider_earnings" ("reference_id", "reference_type")`);

    // ── place_events ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "place_events" (
        "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"    UUID         NOT NULL REFERENCES "temples"("id") ON DELETE CASCADE,
        "title"       VARCHAR(160) NOT NULL,
        "description" TEXT,
        "start_time"  TIMESTAMPTZ  NOT NULL,
        "end_time"    TIMESTAMPTZ,
        "recurring"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "is_hidden"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_place_events_place_start" ON "place_events" ("place_id", "start_time")`);

    // ── place_services ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "place_services" (
        "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"    UUID         NOT NULL REFERENCES "temples"("id") ON DELETE CASCADE,
        "name"        VARCHAR(120) NOT NULL,
        "description" TEXT,
        "is_hidden"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_place_services_place" ON "place_services" ("place_id", "created_at")`);

    // ── commission_rules ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commission_rules" (
        "id"              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "religion_slug"   VARCHAR,
        "service_id"      VARCHAR,
        "provider_role"   VARCHAR,
        "base_pct"        NUMERIC(5,2) NOT NULL DEFAULT 15.0,
        "min_fee_paise"   INT,
        "max_fee_paise"   INT,
        "surge_enabled"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "surge_pct"       NUMERIC(5,2) NOT NULL DEFAULT 0,
        "effective_from"  TIMESTAMPTZ  NOT NULL,
        "effective_to"    TIMESTAMPTZ,
        "is_active"       BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_commission_rules_religion_service" ON "commission_rules" ("religion_slug", "service_id")`);

    // ── discount_codes ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "discount_codes" (
        "id"                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"                VARCHAR(30)  NOT NULL,
        "discount_type"       VARCHAR(20)  NOT NULL,
        "value"               NUMERIC(8,2) NOT NULL,
        "max_discount_paise"  INT,
        "min_order_paise"     INT          NOT NULL DEFAULT 0,
        "max_uses"            INT,
        "uses_count"          INT          NOT NULL DEFAULT 0,
        "max_uses_per_user"   INT          NOT NULL DEFAULT 1,
        "religion_slug"       VARCHAR(30),
        "expires_at"          TIMESTAMPTZ,
        "is_active"           BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_discount_codes_code" UNIQUE ("code")
      )
    `);

    // ── holiday_surges ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "holiday_surges" (
        "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"          VARCHAR(100) NOT NULL,
        "religion_slug" VARCHAR(30),
        "start_date"    DATE         NOT NULL,
        "end_date"      DATE         NOT NULL,
        "multiplier"    NUMERIC(4,2) NOT NULL DEFAULT 1.3,
        "is_active"     BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_holiday_surges_dates" ON "holiday_surges" ("start_date", "end_date")`);

    // ── tds_records ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tds_records" (
        "id"                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"           VARCHAR      NOT NULL,
        "financial_year"        VARCHAR(10)  NOT NULL,
        "total_earnings_paise"  INT          NOT NULL DEFAULT 0,
        "tds_deducted_paise"    INT          NOT NULL DEFAULT 0,
        "tds_threshold_paise"   INT          NOT NULL DEFAULT 3000000,
        "tds_pct"               NUMERIC(5,2) NOT NULL DEFAULT 10.0,
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_tds_records_provider_fy" UNIQUE ("provider_id", "financial_year")
      )
    `);

    // ── travel_fee_rules ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "travel_fee_rules" (
        "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "min_km"              INT         NOT NULL DEFAULT 0,
        "max_km"              INT         NOT NULL,
        "flat_fee_paise"      INT         NOT NULL,
        "per_km_above_paise"  INT         NOT NULL DEFAULT 0,
        "is_active"           BOOLEAN     NOT NULL DEFAULT TRUE,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_travel_fee_km" ON "travel_fee_rules" ("max_km")`);

    // ── provider_bank_accounts ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_bank_accounts" (
        "id"                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"               VARCHAR      NOT NULL,
        "bank_name"                 VARCHAR(100),
        "account_number_encrypted"  TEXT         NOT NULL,
        "ifsc_code"                 VARCHAR(11),
        "beneficiary_name"          VARCHAR(200),
        "upi_id"                    VARCHAR(100),
        "verification_status"       VARCHAR(20)  NOT NULL DEFAULT 'unverified',
        "is_primary"                BOOLEAN      NOT NULL DEFAULT TRUE,
        "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_pba_provider" ON "provider_bank_accounts" ("provider_id")`);

    // ── support_tickets ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "ticket_ref"        VARCHAR     NOT NULL,
        "user_id"           VARCHAR     NOT NULL,
        "provider_id"       VARCHAR,
        "booking_id"        VARCHAR,
        "session_id"        VARCHAR,
        "category"          VARCHAR(50) NOT NULL,
        "priority"          VARCHAR(20) NOT NULL DEFAULT 'p4_low',
        "status"            VARCHAR(20) NOT NULL DEFAULT 'open',
        "subject"           VARCHAR     NOT NULL,
        "description"       TEXT        NOT NULL,
        "assigned_agent_id" VARCHAR,
        "sla_deadline"      TIMESTAMP,
        "first_response_at" TIMESTAMP,
        "resolved_at"       TIMESTAMP,
        "resolution_note"   TEXT,
        "reopen_count"      INT         NOT NULL DEFAULT 0,
        "metadata"          JSONB,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_support_tickets_ref" UNIQUE ("ticket_ref")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_support_tickets_user"         ON "support_tickets" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_support_tickets_status"       ON "support_tickets" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_support_tickets_priority"     ON "support_tickets" ("priority")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_support_tickets_sla_deadline" ON "support_tickets" ("sla_deadline")`);

    // ── ticket_messages ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_messages" (
        "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "ticket_id"    VARCHAR     NOT NULL,
        "author_id"    VARCHAR     NOT NULL,
        "author_type"  VARCHAR(20) NOT NULL,
        "body"         TEXT        NOT NULL,
        "attachments"  JSONB,
        "is_internal"  BOOLEAN     NOT NULL DEFAULT FALSE,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ticket_messages_ticket" ON "ticket_messages" ("ticket_id")`);

    // ── user_addresses ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_addresses" (
        "id"           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"      UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "label"        VARCHAR(50),
        "full_address" TEXT          NOT NULL,
        "city"         VARCHAR(100),
        "state"        VARCHAR(100),
        "country"      VARCHAR(2)    NOT NULL DEFAULT 'IN',
        "postal_code"  VARCHAR(20),
        "latitude"     DECIMAL(10,7),
        "longitude"    DECIMAL(10,7),
        "is_default"   BOOLEAN       NOT NULL DEFAULT FALSE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ua_user" ON "user_addresses" ("user_id")`);

    // ── user_devices ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_devices" (
        "id"           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"      UUID         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_id"    VARCHAR(255) NOT NULL,
        "device_type"  VARCHAR(20)  NOT NULL,
        "push_token"   TEXT,
        "last_seen_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "app_version"  VARCHAR(30),
        "os_version"   VARCHAR(30),
        "status"       VARCHAR(20)  NOT NULL DEFAULT 'active'
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ud_user"        ON "user_devices" ("user_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_ud_user_device" ON "user_devices" ("user_id", "device_id")`);

    // ── verification_submissions ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verification_submissions" (
        "id"               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"      VARCHAR     NOT NULL,
        "status"           VARCHAR     NOT NULL DEFAULT 'draft',
        "submitted_at"     TIMESTAMPTZ,
        "reviewed_at"      TIMESTAMPTZ,
        "reviewer_id"      UUID,
        "rejection_reason" TEXT,
        "version"          INT         NOT NULL DEFAULT 1,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_verification_submissions_provider" ON "verification_submissions" ("provider_id")`);

    // ── verification_documents ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verification_documents" (
        "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "submission_id"  UUID        NOT NULL REFERENCES "verification_submissions"("id") ON DELETE CASCADE,
        "type"           VARCHAR     NOT NULL,
        "s3_key"         VARCHAR     NOT NULL,
        "s3_bucket"      VARCHAR     NOT NULL,
        "content_hash"   VARCHAR     NOT NULL,
        "uploaded_at"    TIMESTAMPTZ NOT NULL,
        "is_verified"    BOOLEAN     NOT NULL DEFAULT FALSE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_verification_documents_submission" ON "verification_documents" ("submission_id")`);

    // ── verification_review_queue ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verification_review_queue" (
        "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"       VARCHAR     NOT NULL,
        "queue_status"      VARCHAR(20) NOT NULL DEFAULT 'pending',
        "assigned_admin_id" VARCHAR,
        "priority"          SMALLINT    NOT NULL DEFAULT 2,
        "notes"             TEXT,
        "submitted_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "reviewed_at"       TIMESTAMPTZ,
        CONSTRAINT "uq_vrq_provider" UNIQUE ("provider_id")
      )
    `);

    // ── admin_review_notes ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_review_notes" (
        "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "submission_id"  UUID        NOT NULL REFERENCES "verification_submissions"("id") ON DELETE CASCADE,
        "admin_id"       VARCHAR     NOT NULL,
        "note"           TEXT        NOT NULL,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_admin_review_notes_submission" ON "admin_review_notes" ("submission_id")`);

    // ── wallets ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"           VARCHAR,
        "owner_type"        VARCHAR(20) NOT NULL DEFAULT 'user',
        "owner_id"          VARCHAR     NOT NULL,
        "available_balance" BIGINT      NOT NULL DEFAULT 0,
        "held_balance"      BIGINT      NOT NULL DEFAULT 0,
        "currency"          VARCHAR(3)  NOT NULL DEFAULT 'INR',
        "status"            VARCHAR(20) NOT NULL DEFAULT 'active',
        "is_locked"         BOOLEAN     NOT NULL DEFAULT FALSE,
        "lock_reason"       TEXT,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_wallets_owner" ON "wallets" ("owner_type", "owner_id")`);

    // ── ledger_entries ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_entries" (
        "id"               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "wallet_id"        VARCHAR       NOT NULL,
        "entry_type"       VARCHAR       NOT NULL,
        "amount"           NUMERIC(14,4) NOT NULL,
        "direction"        SMALLINT      NOT NULL,
        "balance_after"    NUMERIC(14,4) NOT NULL,
        "reference_id"     VARCHAR,
        "reference_type"   VARCHAR(50),
        "idempotency_key"  VARCHAR(255)  NOT NULL,
        "description"      TEXT,
        "metadata"         JSONB         NOT NULL DEFAULT '{}',
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_ledger_entries_idempotency" UNIQUE ("idempotency_key")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ledger_wallet_created" ON "ledger_entries" ("wallet_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ledger_reference"      ON "ledger_entries" ("reference_id")`);

    // ── wallet_holds ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_holds" (
        "id"              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "wallet_id"       VARCHAR       NOT NULL,
        "ledger_entry_id" VARCHAR,
        "amount"          NUMERIC(14,4) NOT NULL,
        "reference_id"    VARCHAR,
        "reference_type"  VARCHAR(50),
        "expires_at"      TIMESTAMPTZ,
        "released_at"     TIMESTAMPTZ,
        "status"          VARCHAR       NOT NULL DEFAULT 'active',
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_holds_wallet"    ON "wallet_holds" ("wallet_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_holds_reference" ON "wallet_holds" ("reference_id")`);

    // ── wallet_balances ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_balances" (
        "wallet_id"  VARCHAR       PRIMARY KEY,
        "available"  NUMERIC(14,4) NOT NULL DEFAULT 0,
        "held"       NUMERIC(14,4) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    // ── bookings: backfill columns added by entity upgrades ───────────────────
    // Migration 015 created a minimal bookings table. The entity was later
    // extended. We use ADD COLUMN IF NOT EXISTS so this is idempotent.
    const bookingPatches: string[] = [
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "booking_ref"           VARCHAR(20)`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "platform_fee_paise"    INT          NOT NULL DEFAULT 0`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tax_amount_paise"      BIGINT       NOT NULL DEFAULT 0`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "provider_amount_paise" BIGINT       NOT NULL DEFAULT 0`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_status"        VARCHAR(20)  NOT NULL DEFAULT 'unpaid'`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "user_timezone"         VARCHAR(50)  NOT NULL DEFAULT 'Asia/Kolkata'`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "user_address_id"       VARCHAR`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "address_json"          JSONB`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_method"        VARCHAR      NOT NULL DEFAULT 'wallet'`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "wallet_debit_ref"      VARCHAR`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "completed_at"          TIMESTAMPTZ`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_by"          VARCHAR(20)`,
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "version"               INT          NOT NULL DEFAULT 1`,
    ];
    for (const sql of bookingPatches) {
      await queryRunner.query(sql);
    }
    // booking_ref unique index (only after column exists)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_bookings_booking_ref" ON "bookings" ("booking_ref") WHERE "booking_ref" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_holds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_review_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_review_queue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_submissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_devices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_addresses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_bank_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "travel_fee_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tds_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "holiday_surges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discount_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commission_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_earnings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payout_batches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fraud_signals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "disputes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_billing_ticks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultation_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_add_ons"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "religions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking_addons"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_slot_locks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_overrides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_action_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admins"`);
  }
}
