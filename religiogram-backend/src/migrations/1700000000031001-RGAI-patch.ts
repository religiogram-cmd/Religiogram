import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patch migration: adds columns that were in the entity but missed in the
 * original 1700000000030-RGAI migration.
 * NOTE: Uses non-standard sub-versioned timestamp (31001). TypeORM ordering
 * is correct (lexicographic). Do NOT follow this pattern for new migrations.
 *
 * ai_messages   -> tokens_input, tokens_output, cost_paise
 * ai_conversations -> deleted_at (for DPDP soft-delete, §7.3)
 */
export class RGAIPatch1700000000031001 implements MigrationInterface {
  name = 'RGAIPatch1700000000031001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ai_messages: per-direction token counts + cost tracking (spec §12, §3.2)
    await queryRunner.query(`
      ALTER TABLE "ai_messages"
        ADD COLUMN IF NOT EXISTS "tokens_input"  INTEGER,
        ADD COLUMN IF NOT EXISTS "tokens_output" INTEGER,
        ADD COLUMN IF NOT EXISTS "cost_paise"    INTEGER
    `);

    // ai_conversations: soft-delete column required for DPDP §7.3
    await queryRunner.query(`
      ALTER TABLE "ai_conversations"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ
    `);

    // Partial index so list queries skip deleted rows efficiently
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_conv_active"
        ON "ai_conversations" ("user_id", "updated_at" DESC)
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ai_conv_active"`);
    await queryRunner.query(`ALTER TABLE "ai_conversations" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "ai_messages" DROP COLUMN IF EXISTS "cost_paise"`);
    await queryRunner.query(`ALTER TABLE "ai_messages" DROP COLUMN IF EXISTS "tokens_output"`);
    await queryRunner.query(`ALTER TABLE "ai_messages" DROP COLUMN IF EXISTS "tokens_input"`);
  }
}
