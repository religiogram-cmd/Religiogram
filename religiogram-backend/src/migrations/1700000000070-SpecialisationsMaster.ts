import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Specialisations master table (migration 070).
 *
 * Moves the astrology / spiritual specialisation list out of the frontend
 * constants and into the DB so admins can add/rename/reorder/disable
 * entries without a frontend deploy.
 *
 * Seed contents match the 41 specialisations that shipped in Phase 1's
 * frontend picker so migrating providers see zero change. Sort order is
 * assigned in ascending increments of 10 per category — leaves gaps for
 * insertions without a reorder pass.
 *
 * Referential integrity note: provider rows continue to store specialisation
 * *labels* in `providers.specialisations text[]`, not IDs. If an admin
 * renames a row here the label on provider rows becomes stale. Renaming is
 * therefore treated as a two-step: keep the old label (add alias support
 * later), or backfill provider rows. Not enforced by the DB.
 */
export class SpecialisationsMaster1700000000070 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS specialisations (
        id              BIGSERIAL PRIMARY KEY,
        slug            VARCHAR(80) NOT NULL UNIQUE,
        name            VARCHAR(80) NOT NULL,
        category        VARCHAR(40) NOT NULL,
        description     TEXT,
        sort_order      INT NOT NULL DEFAULT 100,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        is_trending     BOOLEAN NOT NULL DEFAULT false,
        is_premium_only BOOLEAN NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_specialisations_active_sort
        ON specialisations (is_active, sort_order)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_specialisations_category
        ON specialisations (category)
    `);

    /* ── Seed ──
     * ON CONFLICT DO NOTHING so re-running the migration on a partially
     * seeded DB is safe. Categories/order match the frontend Phase 1 picker. */
    const seed: Array<[string, string, string, number]> = [
      // ── astrology ──
      ['vedic-astrology',        'Vedic Astrology',        'astrology', 10],
      ['kp-astrology',           'KP Astrology',           'astrology', 20],
      ['nadi-astrology',         'Nadi Astrology',         'astrology', 30],
      ['western-astrology',      'Western Astrology',      'astrology', 40],
      ['lal-kitab',              'Lal Kitab',              'astrology', 50],
      ['prashna-astrology',      'Prashna Astrology',      'astrology', 60],
      ['horary-astrology',       'Horary Astrology',       'astrology', 70],
      ['jaimini-astrology',      'Jaimini Astrology',      'astrology', 80],
      ['bhrigu-astrology',       'Bhrigu Astrology',       'astrology', 90],
      ['medical-astrology',      'Medical Astrology',      'astrology', 100],
      ['financial-astrology',    'Financial Astrology',    'astrology', 110],
      ['business-astrology',     'Business Astrology',     'astrology', 120],
      ['career-astrology',       'Career Astrology',       'astrology', 130],
      ['marriage-astrology',     'Marriage Astrology',     'astrology', 140],
      ['relationship-astrology', 'Relationship Astrology', 'astrology', 150],
      ['child-astrology',        'Child Astrology',        'astrology', 160],
      ['health-astrology',       'Health Astrology',       'astrology', 170],
      ['electional-astrology',   'Electional Astrology',   'astrology', 180],
      ['muhurat-expert',         'Muhurat Expert',         'astrology', 190],
      ['horoscope-expert',       'Horoscope Expert',       'astrology', 200],
      ['kundli-expert',          'Kundli Expert',          'astrology', 210],
      ['match-making-expert',    'Match Making Expert',    'astrology', 220],
      ['dosha-expert',           'Dosha Expert',           'astrology', 230],
      // ── divination ──
      ['tarot-reading',          'Tarot Reading',          'divination', 10],
      ['numerology',             'Numerology',             'divination', 20],
      ['palmistry',              'Palmistry',              'divination', 30],
      ['face-reading',           'Face Reading',           'divination', 40],
      ['angel-card-reading',     'Angel Card Reading',     'divination', 50],
      ['oracle-card-reading',    'Oracle Card Reading',    'divination', 60],
      ['dream-interpretation',   'Dream Interpretation',   'divination', 70],
      ['signature-analysis',     'Signature Analysis',     'divination', 80],
      // ── healing ──
      ['reiki-healing',          'Reiki Healing',          'healing',    10],
      ['chakra-healing',         'Chakra Healing',         'healing',    20],
      ['crystal-healing',        'Crystal Healing',        'healing',    30],
      ['gemstone-consultation',  'Gemstone Consultation',  'healing',    40],
      ['rudraksha-consultation', 'Rudraksha Consultation', 'healing',    50],
      // ── home_energy ──
      ['vastu-shastra',          'Vastu Shastra',          'home_energy', 10],
      ['feng-shui',              'Feng Shui',              'home_energy', 20],
      // ── spiritual ──
      ['meditation-guidance',    'Meditation Guidance',    'spiritual',  10],
      ['manifestation-guidance', 'Manifestation Guidance', 'spiritual',  20],
      ['spiritual-counselling',  'Spiritual Counselling',  'spiritual',  30],
    ];
    for (const [slug, name, category, sort] of seed) {
      await queryRunner.query(
        `INSERT INTO specialisations (slug, name, category, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO NOTHING`,
        [slug, name, category, sort],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_specialisations_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_specialisations_active_sort`);
    await queryRunner.query(`DROP TABLE IF EXISTS specialisations`);
  }
}
