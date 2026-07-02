import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Astrology provider category + specialisations + consultation channels.
 *
 * Adds three new columns to `providers`:
 *   • provider_category      varchar  — 'priest' | 'astrologer' (default 'priest')
 *   • specialisations        text[]   — e.g. ['Vedic Astrology','KP Astrology']
 *   • consultation_channels  text[]   — e.g. ['chat','voice','video']
 *
 * Backfills every existing row to `provider_category = 'priest'` so all
 * currently-live providers keep behaving exactly as they do today.
 *
 * Adds indexes:
 *   • idx_providers_category                  — btree on provider_category
 *   • idx_providers_specialisations_gin       — GIN on specialisations (array
 *                                                 element containment queries)
 *   • idx_providers_consultation_channels_gin — GIN on consultation_channels
 *
 * Reversible: down() drops the columns + indexes without data loss for the
 * pre-existing priest rows.
 */
export class AstrologyProviderCategory1700000000068 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Columns
    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS provider_category varchar NOT NULL DEFAULT 'priest',
        ADD COLUMN IF NOT EXISTS specialisations text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS consultation_channels text[] NOT NULL DEFAULT '{}'
    `);

    // 2. Backfill — safety net in case default didn't apply on some rows
    await queryRunner.query(`
      UPDATE providers SET provider_category = 'priest' WHERE provider_category IS NULL
    `);

    // 3. Indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_category
        ON providers (provider_category)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_specialisations_gin
        ON providers USING GIN (specialisations)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_consultation_channels_gin
        ON providers USING GIN (consultation_channels)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_consultation_channels_gin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_specialisations_gin`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_category`);
    await queryRunner.query(`
      ALTER TABLE providers
        DROP COLUMN IF EXISTS consultation_channels,
        DROP COLUMN IF EXISTS specialisations,
        DROP COLUMN IF EXISTS provider_category
    `);
  }
}
