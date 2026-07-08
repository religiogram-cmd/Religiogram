import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converts `ai_birth_profiles.full_name`, `.birth_date`, `.birth_time`, and
 * `.birth_city` from their original types (varchar(200) / date / time /
 * varchar(200)) to `text`.
 *
 * Why: `AiOrchestratorService.saveBirthProfile` encrypts these four fields
 * with AES-GCM and writes ciphertext in `iv:tag:ct` hex form. Ciphertext
 * is longer than 200 chars for full_name/birth_city, and is not a valid
 * `date`/`time` literal at all. Any INSERT with encryption enabled would
 * silently fail on these columns.
 *
 * The switch to `text` is safe: reads decrypt back to strings, and the
 * frontend has always parsed `birthDate` / `birthTime` as strings anyway
 * (no client-side Date parsing that would break).
 *
 * Idempotent: uses `ALTER COLUMN ... TYPE text USING <col>::text` guarded
 * by `information_schema.columns` lookups so re-running is a no-op.
 */
export class BirthProfileTextColumns1700000000077 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    const cols = ['full_name', 'birth_date', 'birth_time', 'birth_city'];
    for (const col of cols) {
      const [row] = await q.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'ai_birth_profiles' AND column_name = $1`,
        [col],
      );
      if (row && row.data_type !== 'text') {
        // USING clause handles date/time → text and varchar → text uniformly.
        await q.query(
          `ALTER TABLE ai_birth_profiles ALTER COLUMN ${col} TYPE text USING ${col}::text`,
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    /* Reverting text → date/time/varchar(200) would fail on encrypted rows
     * (ciphertext is not a valid date literal), so the down migration
     * intentionally does nothing. If you truly need to roll back, first
     * clear or plaintext-restore the affected rows manually. */
  }
}
