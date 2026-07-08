import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `providers.is_busy` — real-time flag flipped ON when a provider is
 * currently in a consultation session and OFF when the session ends or
 * they disconnect. Distinct from `is_online` (which reflects the provider's
 * intent to accept work). The marketplace uses both:
 *   - Online & !Busy → "Available now" green dot
 *   - Online & Busy  → "Busy" amber dot
 *   - Offline        → "Offline" grey dot
 *
 * Toggle sites:
 *   - Consultation start → set is_busy=true on the provider row
 *   - Consultation end   → set is_busy=false
 *   - Socket disconnect  → clear is_busy (session-grace also idempotent)
 *
 * Partial index makes "who's available right now?" queries cheap even at
 * 100k+ providers.
 */
export class ProviderIsBusy1700000000073 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS is_busy boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_available
        ON providers (is_online, is_busy)
        WHERE is_online = true AND is_busy = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_available`);
    await queryRunner.query(`
      ALTER TABLE providers DROP COLUMN IF EXISTS is_busy
    `);
  }
}
