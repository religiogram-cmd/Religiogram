import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed services_master with a curated, multi-religion catalogue.
 *
 * Design choices:
 *
 *  • Prices in paise. Min/max are guardrails for the pricing screen — NOT
 *    enforced at submit time (a provider may reasonably charge above/below).
 *  • Duration in minutes is a typical value, not a hard cap.
 *  • We assign sort_order per (religion, category) in the order the rituals
 *    are usually listed, so the picker feels natural.
 *  • Slugs are stable (religion-scoped unique) so the frontend can deep-link
 *    to a service (`/services/hindu/ganesh-puja`) if we ever want that.
 *
 * Adding new services later: just append a row; the client picker rebuilds
 * the category tree from the flat list.
 */

type SeedRow = {
  religion: 'hindu' | 'islam' | 'sikh' | 'christian' | 'other';
  category: string;
  name: string;
  slug: string;
  description: string;
  minPaise: number | null;
  maxPaise: number | null;
  durationMin: number | null;
};

/* eslint-disable prettier/prettier */
const SEEDS: SeedRow[] = [
  // ─── HINDU ────────────────────────────────────────────────────────
  // Daily Rituals
  { religion: 'hindu', category: 'Daily Rituals', name: 'Ganesh Puja',        slug: 'ganesh-puja',        description: 'Daily invocation of Lord Ganesha for auspicious beginnings.',        minPaise: 50_000,  maxPaise: 2_50_000,  durationMin: 45  },
  { religion: 'hindu', category: 'Daily Rituals', name: 'Lakshmi Puja',       slug: 'lakshmi-puja',       description: 'Prayers for wealth and prosperity.',                                  minPaise: 80_000,  maxPaise: 3_00_000,  durationMin: 60  },
  { religion: 'hindu', category: 'Daily Rituals', name: 'Saraswati Puja',     slug: 'saraswati-puja',     description: 'Blessings for knowledge and wisdom.',                                 minPaise: 60_000,  maxPaise: 2_50_000,  durationMin: 45  },
  { religion: 'hindu', category: 'Daily Rituals', name: 'Satyanarayan Katha', slug: 'satyanarayan-katha', description: 'Household sanctification through the Satyanarayan story.',           minPaise: 1_50_000, maxPaise: 5_00_000, durationMin: 120 },
  { religion: 'hindu', category: 'Daily Rituals', name: 'Hanuman Chalisa',    slug: 'hanuman-chalisa',    description: 'Recitation of the Hanuman Chalisa.',                                  minPaise: 30_000,  maxPaise: 1_50_000,  durationMin: 30  },

  // Festival Pujas
  { religion: 'hindu', category: 'Festival Pujas', name: 'Diwali Lakshmi Puja',  slug: 'diwali-lakshmi-puja',  description: 'Festival-night puja for Goddess Lakshmi.',       minPaise: 2_00_000, maxPaise: 8_00_000, durationMin: 90 },
  { religion: 'hindu', category: 'Festival Pujas', name: 'Navratri Puja',        slug: 'navratri-puja',        description: 'Nine-night Devi worship.',                       minPaise: 3_50_000, maxPaise: 15_00_000, durationMin: 120 },
  { religion: 'hindu', category: 'Festival Pujas', name: 'Ganesh Chaturthi',     slug: 'ganesh-chaturthi',     description: 'Ganesh idol installation and puja.',             minPaise: 2_50_000, maxPaise: 10_00_000, durationMin: 90 },
  { religion: 'hindu', category: 'Festival Pujas', name: 'Janmashtami Puja',     slug: 'janmashtami-puja',     description: 'Birth of Krishna midnight puja.',                minPaise: 2_00_000, maxPaise: 8_00_000, durationMin: 90 },
  { religion: 'hindu', category: 'Festival Pujas', name: 'Karwa Chauth Katha',   slug: 'karwa-chauth-katha',   description: 'Reading of the Karwa Chauth story.',             minPaise: 1_50_000, maxPaise: 5_00_000, durationMin: 60 },

  // Dosha Pujas
  { religion: 'hindu', category: 'Dosha Pujas', name: 'Kaal Sarp Dosh Puja',   slug: 'kaal-sarp-dosh-puja',   description: 'Remedial puja for Kaal Sarp dosha.',             minPaise: 8_00_000, maxPaise: 25_00_000, durationMin: 180 },
  { religion: 'hindu', category: 'Dosha Pujas', name: 'Navgraha Shanti',       slug: 'navgraha-shanti',       description: 'Peace-bringing ritual for all nine planets.',    minPaise: 5_00_000, maxPaise: 20_00_000, durationMin: 150 },
  { religion: 'hindu', category: 'Dosha Pujas', name: 'Mangal Dosh Nivaran',   slug: 'mangal-dosh-nivaran',   description: 'Remedy for Mangal (Mars) dosha.',                minPaise: 4_00_000, maxPaise: 15_00_000, durationMin: 120 },
  { religion: 'hindu', category: 'Dosha Pujas', name: 'Pitra Dosh Puja',       slug: 'pitra-dosh-puja',       description: 'Ancestral-line peace ritual.',                   minPaise: 5_00_000, maxPaise: 18_00_000, durationMin: 150 },

  // Life Events
  { religion: 'hindu', category: 'Life Events', name: 'Naamkaran (Naming)',   slug: 'naamkaran',             description: 'Traditional naming ceremony for a newborn.',     minPaise: 3_00_000, maxPaise: 10_00_000, durationMin: 90 },
  { religion: 'hindu', category: 'Life Events', name: 'Mundan (First Haircut)', slug: 'mundan',              description: 'First-haircut rite-of-passage for a child.',     minPaise: 2_50_000, maxPaise: 8_00_000, durationMin: 75 },
  { religion: 'hindu', category: 'Life Events', name: 'Griha Pravesh',        slug: 'griha-pravesh',         description: 'House-warming sanctification.',                  minPaise: 5_00_000, maxPaise: 25_00_000, durationMin: 180 },
  { religion: 'hindu', category: 'Life Events', name: 'Vivah (Wedding Rites)', slug: 'vivah',                description: 'Complete Vedic wedding ceremony.',               minPaise: 25_00_000, maxPaise: 1_00_00_000, durationMin: 360 },
  { religion: 'hindu', category: 'Life Events', name: 'Antyeshti (Last Rites)', slug: 'antyeshti',           description: 'Funeral and last-rites observance.',             minPaise: 8_00_000, maxPaise: 30_00_000, durationMin: 240 },
  { religion: 'hindu', category: 'Life Events', name: 'Shraddha',             slug: 'shraddha',              description: 'Annual ancestral remembrance ceremony.',         minPaise: 3_00_000, maxPaise: 10_00_000, durationMin: 120 },

  // ─── ISLAM ────────────────────────────────────────────────────────
  { religion: 'islam', category: 'Nikah & Family',  name: 'Nikah Ceremony',         slug: 'nikah',              description: 'Islamic marriage solemnization with witnesses.',     minPaise: 10_00_000, maxPaise: 50_00_000, durationMin: 120 },
  { religion: 'islam', category: 'Nikah & Family',  name: 'Aqeeqah',                slug: 'aqeeqah',            description: 'Seventh-day newborn naming and sacrifice.',          minPaise: 4_00_000, maxPaise: 15_00_000, durationMin: 90 },
  { religion: 'islam', category: 'Nikah & Family',  name: 'Khatna (Circumcision)',  slug: 'khatna-guidance',    description: 'Religious guidance for the rite.',                    minPaise: 2_00_000, maxPaise: 8_00_000, durationMin: 60 },

  { religion: 'islam', category: 'Janaza & Remembrance', name: 'Janaza Prayers',    slug: 'janaza',             description: 'Funeral prayer service.',                             minPaise: 3_00_000, maxPaise: 10_00_000, durationMin: 60 },
  { religion: 'islam', category: 'Janaza & Remembrance', name: 'Soyem / Chaliswan', slug: 'soyem-chaliswan',    description: 'Third and fortieth-day remembrance.',                 minPaise: 3_00_000, maxPaise: 12_00_000, durationMin: 90 },
  { religion: 'islam', category: 'Janaza & Remembrance', name: 'Milad un Nabi',     slug: 'milad-un-nabi',      description: 'Home Milad recitation.',                              minPaise: 3_00_000, maxPaise: 12_00_000, durationMin: 90 },

  { religion: 'islam', category: 'Daily & Ramadan',  name: 'Dua / Qirat Majlis',   slug: 'dua-qirat-majlis',   description: 'Home recitation gathering.',                          minPaise: 1_50_000, maxPaise: 6_00_000, durationMin: 60 },
  { religion: 'islam', category: 'Daily & Ramadan',  name: 'Taraweeh Imamat',      slug: 'taraweeh-imamat',    description: 'Ramadan Taraweeh Imamat service.',                    minPaise: 5_00_000, maxPaise: 25_00_000, durationMin: 180 },
  { religion: 'islam', category: 'Daily & Ramadan',  name: 'Sehri/Iftar Dua',      slug: 'sehri-iftar-dua',    description: 'Household dua for Ramadan meals.',                    minPaise: 1_00_000, maxPaise: 4_00_000, durationMin: 30 },
  { religion: 'islam', category: 'Daily & Ramadan',  name: 'Khatm-e-Quran',        slug: 'khatm-e-quran',      description: 'Completion recitation of the Quran.',                 minPaise: 4_00_000, maxPaise: 15_00_000, durationMin: 180 },

  // ─── SIKH ─────────────────────────────────────────────────────────
  { religion: 'sikh', category: 'Daily Rituals',   name: 'Sukhmani Sahib Paath', slug: 'sukhmani-sahib',     description: 'Recitation of Sukhmani Sahib for peace.',             minPaise: 2_00_000, maxPaise: 8_00_000, durationMin: 120 },
  { religion: 'sikh', category: 'Daily Rituals',   name: 'Akhand Paath',          slug: 'akhand-paath',      description: '48-hour continuous reading of Guru Granth Sahib.',    minPaise: 15_00_000, maxPaise: 50_00_000, durationMin: 2880 },
  { religion: 'sikh', category: 'Daily Rituals',   name: 'Ardas',                 slug: 'ardas',             description: 'Short congregational prayer.',                         minPaise: 80_000, maxPaise: 3_00_000, durationMin: 30 },
  { religion: 'sikh', category: 'Life Events',     name: 'Anand Karaj (Wedding)', slug: 'anand-karaj',       description: 'Sikh wedding ceremony.',                               minPaise: 15_00_000, maxPaise: 50_00_000, durationMin: 150 },
  { religion: 'sikh', category: 'Life Events',     name: 'Amrit Sanchar',         slug: 'amrit-sanchar',     description: 'Khalsa initiation ceremony guidance.',                 minPaise: 5_00_000, maxPaise: 20_00_000, durationMin: 180 },
  { religion: 'sikh', category: 'Life Events',     name: 'Antam Sanskar',         slug: 'antam-sanskar',     description: 'Sikh last rites service.',                             minPaise: 5_00_000, maxPaise: 20_00_000, durationMin: 120 },
  { religion: 'sikh', category: 'Life Events',     name: 'Bhog Ceremony',         slug: 'bhog',              description: 'Completion ceremony after paath.',                     minPaise: 3_00_000, maxPaise: 12_00_000, durationMin: 90  },

  // ─── CHRISTIAN ────────────────────────────────────────────────────
  { religion: 'christian', category: 'Sacraments',    name: 'Baptism',            slug: 'baptism',            description: 'Infant or adult baptism service.',                    minPaise: 5_00_000, maxPaise: 20_00_000, durationMin: 60 },
  { religion: 'christian', category: 'Sacraments',    name: 'Holy Communion',     slug: 'holy-communion',     description: 'Celebration of the Eucharist.',                       minPaise: 3_00_000, maxPaise: 10_00_000, durationMin: 75 },
  { religion: 'christian', category: 'Sacraments',    name: 'Confirmation',       slug: 'confirmation',       description: 'Confirmation sacrament.',                             minPaise: 4_00_000, maxPaise: 12_00_000, durationMin: 60 },
  { religion: 'christian', category: 'Life Events',   name: 'Wedding Service',    slug: 'wedding-service',    description: 'Holy matrimony service.',                             minPaise: 20_00_000, maxPaise: 80_00_000, durationMin: 120 },
  { religion: 'christian', category: 'Life Events',   name: 'Funeral Service',    slug: 'funeral-service',    description: 'Funeral / memorial service.',                         minPaise: 6_00_000, maxPaise: 25_00_000, durationMin: 90 },
  { religion: 'christian', category: 'Daily & Home',  name: 'Home Blessing',      slug: 'home-blessing',      description: 'Prayer service for a new home.',                      minPaise: 3_00_000, maxPaise: 12_00_000, durationMin: 60 },
  { religion: 'christian', category: 'Daily & Home',  name: 'Prayer Meeting',     slug: 'prayer-meeting',     description: 'Small-group prayer gathering.',                       minPaise: 1_50_000, maxPaise: 6_00_000, durationMin: 60 },
  { religion: 'christian', category: 'Daily & Home',  name: 'Counselling',        slug: 'counselling',        description: 'Spiritual counselling (per session).',                minPaise: 80_000,  maxPaise: 3_00_000, durationMin: 45 },

  // ─── OTHER (umbrella) ────────────────────────────────────────────
  { religion: 'other', category: 'General',        name: 'Meditation Session',    slug: 'meditation-session', description: 'Guided meditation.',                                  minPaise: 50_000,   maxPaise: 3_00_000, durationMin: 30 },
  { religion: 'other', category: 'General',        name: 'Spiritual Counselling', slug: 'spiritual-counselling', description: 'One-on-one spiritual guidance.',                minPaise: 60_000,   maxPaise: 3_00_000, durationMin: 45 },
  { religion: 'other', category: 'General',        name: 'Interfaith Ceremony',   slug: 'interfaith-ceremony', description: 'Custom multi-faith ceremony.',                      minPaise: 10_00_000, maxPaise: 30_00_000, durationMin: 120 },
];
/* eslint-enable prettier/prettier */

export class SeedServicesMaster1700000000013 implements MigrationInterface {
  name = 'SeedServicesMaster1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Group by (religion, category) so sort_order is stable per category.
    const byGroup = new Map<string, SeedRow[]>();
    for (const row of SEEDS) {
      const k = `${row.religion}|${row.category}`;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(row);
    }

    for (const rows of byGroup.values()) {
      let order = 0;
      for (const r of rows) {
        order += 1;
        await queryRunner.query(
          `
          INSERT INTO services_master
            (religion, category, name, slug, description,
             suggested_min_price, suggested_max_price,
             suggested_duration_minutes, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (religion, slug) DO NOTHING
          `,
          [
            r.religion,
            r.category,
            r.name,
            r.slug,
            r.description,
            r.minPaise,
            r.maxPaise,
            r.durationMin,
            order,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM services_master;`);
  }
}
