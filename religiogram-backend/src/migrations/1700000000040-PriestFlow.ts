import { MigrationInterface, QueryRunner } from 'typeorm';

export class PriestFlow1700000000040 implements MigrationInterface {
  name = 'PriestFlow1700000000040';

  async up(qr: QueryRunner): Promise<void> {
    // 1. Add columns to providers table
    await qr.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS service_mode TEXT NOT NULL DEFAULT 'both'
          CHECK (service_mode IN ('offline','online','both'))
    `);
    await qr.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS per_minute_paise INT NULL
    `);
    await qr.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS per_minute_tier TEXT NULL
          CHECK (per_minute_tier IN ('new','verified','senior'))
    `);
    await qr.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS provider_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (provider_state IN ('pending','submitted','approved','rejected','suspended','blocked'))
    `);

    // 2. Add columns to catalog_services
    await qr.query(`
      ALTER TABLE catalog_services
        ADD COLUMN IF NOT EXISTS rg_price_paise BIGINT NULL
    `);
    await qr.query(`
      ALTER TABLE catalog_services
        ADD COLUMN IF NOT EXISTS market_min_paise BIGINT NULL
    `);
    await qr.query(`
      ALTER TABLE catalog_services
        ADD COLUMN IF NOT EXISTS market_max_paise BIGINT NULL
    `);
    await qr.query(`
      ALTER TABLE catalog_services
        ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT false
    `);

    // 3. Create consultation_intro_sessions table
    await qr.query(`
      CREATE TABLE IF NOT EXISTS consultation_intro_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL UNIQUE,
        user_id UUID NOT NULL,
        provider_id UUID NOT NULL,
        plan_type TEXT NOT NULL CHECK (plan_type IN ('intro_5','pack_20','pack_30','per_minute')),
        intro_paise BIGINT NOT NULL,
        intro_minutes INT NOT NULL DEFAULT 5,
        per_minute_paise INT NOT NULL,
        cashback_eligible BOOLEAN NOT NULL DEFAULT false,
        cashback_issued BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 4. Add catalog_service_id FK to bookings
    await qr.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS catalog_service_id UUID NULL
    `);

    // 5. Add device_fingerprint + submitted_ip + review fields to kyc_videos
    await qr.query(`
      ALTER TABLE kyc_videos
        ADD COLUMN IF NOT EXISTS device_fingerprint TEXT NULL
    `);
    await qr.query(`
      ALTER TABLE kyc_videos
        ADD COLUMN IF NOT EXISTS submitted_ip INET NULL
    `);
    await qr.query(`
      ALTER TABLE kyc_videos
        ADD COLUMN IF NOT EXISTS review_decision TEXT NULL
          CHECK (review_decision IN ('approved','rejected','requested_info'))
    `);
    await qr.query(`
      ALTER TABLE kyc_videos
        ADD COLUMN IF NOT EXISTS review_notes TEXT NULL
    `);

    // 6. Indexes
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_religion_state
        ON providers (religion, provider_state) WHERE provider_state = 'approved'
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_per_minute_online
        ON providers (per_minute_paise) WHERE provider_state = 'approved'
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_provider_state
        ON providers (provider_state)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_intro_sessions_user
        ON consultation_intro_sessions (user_id)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_kyc_videos_pending_new
        ON kyc_videos (created_at) WHERE review_decision IS NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // no-op: idempotent migration
  }
}
