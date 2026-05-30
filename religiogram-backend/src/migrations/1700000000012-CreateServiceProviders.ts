import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Service Provider onboarding schema — v1.
 *
 * Design notes:
 *
 *  • `providers` is the hub row; one per user enrolled as a provider.
 *  • `services_master` is a curated (religion, category, name) lookup that
 *    drives Step 4 of onboarding. Seeded separately — never user-writable.
 *  • `provider_services` stores the provider's selected services + pricing.
 *    For "Other" choices `service_id` is NULL and `custom_name` carries the
 *    free-text label. A CHECK enforces one-or-the-other is present.
 *  • `availability` is a thin week-of-week table — one row per (provider,
 *    day, slot). Keep it flat for fast calendar rendering.
 *  • `kyc_videos` stores S3 keys + review state; provider can only have
 *    one active (non-rejected) video — enforced by partial unique index.
 *  • `onboarding_drafts` persists the wizard state between sessions.
 *    One row per user keyed on user_id. Content is a JSONB blob that mirrors
 *    the client form state so "resume later" is trivial.
 *
 * Indexes favour the hot paths:
 *   - list services by religion (services_master)
 *   - list provider services by provider (provider_services)
 *   - list availability by provider + day (availability)
 *   - admin queue of pending KYC (kyc_videos.status)
 *
 * We use BIGSERIAL ids to avoid collisions at lakh-scale. CHECK constraints
 * are cheap and save us from bad data on day one.
 */
export class CreateServiceProviders1700000000012 implements MigrationInterface {
  name = 'CreateServiceProviders1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE provider_religion_enum AS ENUM (
        'hindu', 'islam', 'sikh', 'christian', 'other'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE provider_status_enum AS ENUM (
        'draft', 'pending_review', 'approved', 'rejected', 'suspended'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE service_mode_enum AS ENUM ('online', 'offline', 'both');
    `);

    await queryRunner.query(`
      CREATE TYPE kyc_status_enum AS ENUM (
        'uploaded', 'pending_review', 'approved', 'rejected'
      );
    `);

    /* ─────────────────────────── providers ─────────────────────────── */
    await queryRunner.query(`
      CREATE TABLE providers (
        id              BIGSERIAL PRIMARY KEY,
        user_id         UUID NOT NULL UNIQUE
                         REFERENCES users(id) ON DELETE CASCADE,
        full_name       VARCHAR(120) NOT NULL,
        dob             DATE         NOT NULL,
        phone           VARCHAR(20)  NOT NULL,
        city            VARCHAR(120) NOT NULL,
        religion        provider_religion_enum,
        experience_years SMALLINT,
        languages       TEXT[]  NOT NULL DEFAULT '{}',
        bio             TEXT,
        status          provider_status_enum NOT NULL DEFAULT 'draft',
        rejection_reason TEXT,
        approved_at     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_provider_exp CHECK (
          experience_years IS NULL OR
          (experience_years >= 0 AND experience_years <= 80)
        ),
        CONSTRAINT chk_provider_dob CHECK (dob < CURRENT_DATE)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_providers_status_religion
        ON providers (status, religion);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_providers_city
        ON providers (city);
    `);

    /* ──────────────────────── services_master ──────────────────────── */
    await queryRunner.query(`
      CREATE TABLE services_master (
        id          BIGSERIAL PRIMARY KEY,
        religion    provider_religion_enum NOT NULL,
        category    VARCHAR(80)  NOT NULL,
        name        VARCHAR(160) NOT NULL,
        slug        VARCHAR(200) NOT NULL,
        description TEXT,
        /* Suggested price band helps the pricing screen show a sensible
         * default and guards against typos (e.g. priest listing 50000 for
         * a 500-rupee ritual by mistake). */
        suggested_min_price INTEGER,
        suggested_max_price INTEGER,
        /* Typical duration in minutes — pre-fills Step 5. */
        suggested_duration_minutes INTEGER,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  SMALLINT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_services_religion_slug UNIQUE (religion, slug),
        CONSTRAINT chk_services_price_band CHECK (
          (suggested_min_price IS NULL AND suggested_max_price IS NULL) OR
          (suggested_min_price >= 0 AND suggested_max_price >= suggested_min_price)
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_services_religion_category
        ON services_master (religion, category, sort_order);
    `);

    /* ───────────────────── provider_services ──────────────────────── */
    await queryRunner.query(`
      CREATE TABLE provider_services (
        id           BIGSERIAL PRIMARY KEY,
        provider_id  BIGINT NOT NULL
                      REFERENCES providers(id) ON DELETE CASCADE,
        service_id   BIGINT REFERENCES services_master(id),
        custom_name  VARCHAR(160),
        /* Pricing  (INTEGER paise — ₹1000.00 stored as 100000). Using
         * paise everywhere avoids floating-point drift on line totals. */
        base_price_paise     INTEGER NOT NULL,
        travel_fee_paise     INTEGER NOT NULL DEFAULT 0,
        addon_fee_paise      INTEGER NOT NULL DEFAULT 0,
        duration_minutes     SMALLINT NOT NULL,
        mode         service_mode_enum NOT NULL,
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        /* One of service_id or custom_name must be present; never both. */
        CONSTRAINT chk_ps_service_or_custom CHECK (
          (service_id IS NOT NULL AND custom_name IS NULL) OR
          (service_id IS NULL     AND custom_name IS NOT NULL)
        ),
        CONSTRAINT chk_ps_price_pos CHECK (
          base_price_paise >= 0 AND travel_fee_paise >= 0 AND addon_fee_paise >= 0
        ),
        CONSTRAINT chk_ps_duration CHECK (
          duration_minutes BETWEEN 5 AND 1440
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ps_provider ON provider_services (provider_id, is_active);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_ps_provider_service
        ON provider_services (provider_id, service_id)
        WHERE service_id IS NOT NULL;
    `);

    /* ───────────────────────── availability ───────────────────────── */
    await queryRunner.query(`
      CREATE TABLE availability (
        id           BIGSERIAL PRIMARY KEY,
        provider_id  BIGINT NOT NULL
                      REFERENCES providers(id) ON DELETE CASCADE,
        /* 0 = Sunday … 6 = Saturday (JS Date.getDay() convention). */
        day_of_week  SMALLINT NOT NULL,
        start_time   TIME NOT NULL,
        end_time     TIME NOT NULL,
        is_break     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_avail_dow CHECK (day_of_week BETWEEN 0 AND 6),
        CONSTRAINT chk_avail_order CHECK (start_time < end_time)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_avail_provider_day
        ON availability (provider_id, day_of_week);
    `);

    /* ────────────────────────── kyc_videos ────────────────────────── */
    await queryRunner.query(`
      CREATE TABLE kyc_videos (
        id           BIGSERIAL PRIMARY KEY,
        provider_id  BIGINT NOT NULL
                      REFERENCES providers(id) ON DELETE CASCADE,
        s3_key       VARCHAR(512) NOT NULL,
        thumbnail_s3_key VARCHAR(512),
        duration_seconds NUMERIC(6,2) NOT NULL,
        size_bytes   BIGINT NOT NULL,
        mime_type    VARCHAR(80)  NOT NULL,
        status       kyc_status_enum NOT NULL DEFAULT 'uploaded',
        rejection_reason TEXT,
        reviewed_by  UUID REFERENCES users(id),
        reviewed_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_kyc_duration CHECK (duration_seconds >= 30),
        CONSTRAINT chk_kyc_size CHECK (
          size_bytes > 0 AND size_bytes <= 100 * 1024 * 1024
        )
      );
    `);
    /* Only one live (non-rejected) KYC video per provider — the admin
     * review queue becomes trivial. */
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_kyc_live_per_provider
        ON kyc_videos (provider_id)
        WHERE status <> 'rejected';
    `);
    await queryRunner.query(`
      CREATE INDEX idx_kyc_status
        ON kyc_videos (status, created_at);
    `);

    /* ────────────────────── onboarding_drafts ─────────────────────── */
    await queryRunner.query(`
      CREATE TABLE onboarding_drafts (
        user_id      UUID PRIMARY KEY
                      REFERENCES users(id) ON DELETE CASCADE,
        step         SMALLINT NOT NULL DEFAULT 1,
        data         JSONB    NOT NULL DEFAULT '{}'::jsonb,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_draft_step CHECK (step BETWEEN 1 AND 7)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS onboarding_drafts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS kyc_videos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS availability;`);
    await queryRunner.query(`DROP TABLE IF EXISTS provider_services;`);
    await queryRunner.query(`DROP TABLE IF EXISTS services_master;`);
    await queryRunner.query(`DROP TABLE IF EXISTS providers;`);
    await queryRunner.query(`DROP TYPE IF EXISTS kyc_status_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS service_mode_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS provider_status_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS provider_religion_enum;`);
  }
}
