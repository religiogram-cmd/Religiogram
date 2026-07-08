import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `ai_birth_profiles.birth_country` as a plaintext varchar(80) column.
 *
 * Why plaintext: country isn't PII by itself, and the astrologer context
 * brief needs to render "Place: Delhi, India" without a decrypt round-trip.
 * Full-name / birth_date / birth_time remain encrypted at rest — this
 * column joins `birth_city` on the plaintext side of the entity.
 *
 * Fully idempotent: `ADD COLUMN IF NOT EXISTS` and an information_schema
 * guard on the down path both handle "already ran on this DB" gracefully.
 */
export class BirthProfileCountry1700000000078 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ai_birth_profiles
       ADD COLUMN IF NOT EXISTS birth_country varchar(80) NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ai_birth_profiles' AND column_name = 'birth_country'`,
    );
    if (row) {
      await q.query(`ALTER TABLE ai_birth_profiles DROP COLUMN birth_country`);
    }
  }
}
