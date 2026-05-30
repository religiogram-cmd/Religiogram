/**
 * ReligioGram — Database Seed Script
 * Run: npx ts-node src/seed.ts
 *
 * Seeds: admin user, catalog faiths/services, sample priests (4 faiths),
 *        sample temples (4 cities), discount codes, and system feature flags.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcryptjs';  // BUG-1 v8: emailLogin uses bcryptjs.compare; seed MUST match
import { config } from 'dotenv';
config();

// ── minimal inline DataSource (no app bootstrap needed) ──────────────────────
const AppDataSource = new DataSource({
  type:        'postgres',
  url:         process.env.DATABASE_URL ?? 'postgresql://religiogram:religiogram@localhost:5432/religiogram',
  synchronize: false,
  logging:     false,
  entities:    [__dirname + '/**/*.entity{.ts,.js}'],
});

// ── helpers ───────────────────────────────────────────────────────────────────
const run = (sql: string, params: any[] = []) =>
  AppDataSource.query(sql, params);

async function upsert(table: string, conflictCol: string, row: Record<string, any>) {
  const cols  = Object.keys(row);
  const vals  = Object.values(row);
  const marks = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter(c => c !== conflictCol)
    .map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
  await run(
    `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')})
     VALUES (${marks})
     ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`,
    vals,
  );
}

// ── main seed ─────────────────────────────────────────────────────────────────
async function seed() {
  // P0-5: refuse to seed in production. The seed flow is for dev/staging only.
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: seed.ts must not be run in production. Use authenticated admin onboarding.');
    process.exit(1);
  }

  // P0-5: admin password must be supplied via env. We never log it.
  const adminPasswordPlain = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPasswordPlain || adminPasswordPlain.length < 12) {
    console.error('FATAL: set SEED_ADMIN_PASSWORD (≥12 chars) before running seed.ts');
    process.exit(1);
  }

  await AppDataSource.initialize();
  console.log('✔  Connected to DB');

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  // BUG-1 (v8): use bcrypt — same algorithm emailLogin's bcryptjs.compare expects.
  // Previously used scryptSync ("salt:scryptHex") which produced a hash bcryptjs cannot compare.
  const adminPwd = hashSync(adminPasswordPlain, 12);
  await run(`
    INSERT INTO "users" (email, phone, name, role, password_hash, is_verified, created_at, updated_at)
    VALUES ($1,$2,$3,'admin',$4,true,NOW(),NOW())
    ON CONFLICT (email) DO NOTHING
  `, [process.env.SEED_ADMIN_EMAIL ?? 'admin@religiogram.app', '+919999000001', 'Super Admin', adminPwd]);
  console.log('✔  Admin user seeded  (email = SEED_ADMIN_EMAIL, password = SEED_ADMIN_PASSWORD)');

  // ── 2. Catalog — faiths ────────────────────────────────────────────────────
  const faiths = [
    { slug: 'hindu',     name: 'Hindu',     icon: 'om',      sort_order: 1 },
    { slug: 'muslim',    name: 'Muslim',    icon: 'crescent', sort_order: 2 },
    { slug: 'christian', name: 'Christian', icon: 'cross',   sort_order: 3 },
    { slug: 'sikh',      name: 'Sikh',      icon: 'khanda',  sort_order: 4 },
    { slug: 'buddhist',  name: 'Buddhist',  icon: 'wheel',   sort_order: 5 },
    { slug: 'jain',      name: 'Jain',      icon: 'hand',    sort_order: 6 },
  ];
  for (const f of faiths) {
    await run(`
      INSERT INTO "catalog_faiths" (slug, name, icon, sort_order, created_at, updated_at)
      VALUES ($1,$2,$3,$4,NOW(),NOW())
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order
    `, [f.slug, f.name, f.icon, f.sort_order]);
  }
  console.log('✔  Catalog faiths seeded (6 faiths)');

  // ── 3. Catalog — service types ─────────────────────────────────────────────
  const services = [
    { slug: 'puja',          name: 'Puja / Prayer Service',  base_price_inr: 1100, faith: 'hindu'    },
    { slug: 'havan',         name: 'Havan / Yagna',          base_price_inr: 3100, faith: 'hindu'    },
    { slug: 'kundli',        name: 'Kundli Reading',         base_price_inr:  800, faith: 'hindu'    },
    { slug: 'astrology',     name: 'Astrology Consultation', base_price_inr:  500, faith: 'hindu'    },
    { slug: 'namaz',         name: 'Namaz Guidance',         base_price_inr:  500, faith: 'muslim'   },
    { slug: 'nikah',         name: 'Nikah Ceremony',         base_price_inr: 5100, faith: 'muslim'   },
    { slug: 'mass',          name: 'Mass / Prayer',          base_price_inr:  300, faith: 'christian'},
    { slug: 'wedding',       name: 'Christian Wedding',      base_price_inr: 7500, faith: 'christian'},
    { slug: 'ardas',         name: 'Ardas',                  base_price_inr:  700, faith: 'sikh'     },
    { slug: 'anand_karaj',   name: 'Anand Karaj',            base_price_inr: 4100, faith: 'sikh'     },
    { slug: 'online_consult',name: 'Online Consultation',    base_price_inr:  200, faith: null       },
    { slug: 'home_visit',    name: 'Home Visit',             base_price_inr: 1500, faith: null       },
  ];
  for (const s of services) {
    await run(`
      INSERT INTO "catalog_services" (slug, name, base_price_inr, faith_slug, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,true,NOW(),NOW())
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, base_price_inr=EXCLUDED.base_price_inr
    `, [s.slug, s.name, s.base_price_inr, s.faith ?? null]);
  }
  console.log('✔  Catalog services seeded (12 services)');

  // ── 4. Sample priests / service providers ─────────────────────────────────
  const priests = [
    { name: 'Pandit Ramesh Sharma',   email: 'ramesh.sharma@rg.app',  phone: '+919810001001', faith: 'hindu',     city: 'Delhi',   lat: 28.6139, lng: 77.2090, rating: 4.9, sessions: 312, bio: 'Vedic Pandit with 20 years experience in puja and havan ceremonies.' },
    { name: 'Maulana Tariq Ahmed',    email: 'tariq.ahmed@rg.app',    phone: '+919820002002', faith: 'muslim',    city: 'Mumbai',  lat: 19.0760, lng: 72.8777, rating: 4.8, sessions: 178, bio: 'Scholar specializing in Nikah and Islamic guidance.' },
    { name: 'Father Anthony D\'Souza',email: 'anthony.dsouza@rg.app', phone: '+919830003003', faith: 'christian', city: 'Goa',     lat: 15.2993, lng: 74.1240, rating: 4.7, sessions: 205, bio: 'Ordained priest offering mass, weddings and counselling.' },
    { name: 'Granthi Gurpreet Singh', email: 'gurpreet.singh@rg.app', phone: '+919840004004', faith: 'sikh',      city: 'Amritsar',lat: 31.6340, lng: 74.8723, rating: 4.9, sessions: 441, bio: 'Gurmukhi scholar and Granthi at Golden Temple.' },
    { name: 'Pandit Vijay Joshi',     email: 'vijay.joshi@rg.app',    phone: '+919850005005', faith: 'hindu',     city: 'Pune',    lat: 18.5204, lng: 73.8567, rating: 4.6, sessions: 89,  bio: 'Astrologer and Vedic puja specialist.' },
    { name: 'Jyotishi Kavita Devi',   email: 'kavita.devi@rg.app',    phone: '+919860006006', faith: 'hindu',     city: 'Varanasi',lat: 25.3176, lng: 82.9739, rating: 5.0, sessions: 621, bio: 'Third-generation astrologer. Kundli and horoscope expert.' },
  ];

  for (const p of priests) {
    // user row
    // BUG-1 (v8): bcrypt to match emailLogin
    const pwd = hashSync((() => {
      const pw = process.env.SEED_PRIEST_PASSWORD;
      if (!pw) throw new Error('SEED_PRIEST_PASSWORD must be set');
      return pw;
    })(), 12);
    const uRes = await run(`
      INSERT INTO "users" (email, phone, name, role, password_hash, is_verified, created_at, updated_at)
      VALUES ($1,$2,$3,'provider',$4,true,NOW(),NOW())
      ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name
      RETURNING id
    `, [p.email, p.phone, p.name, pwd]);
    const userId = uRes[0]?.id;
    if (!userId) continue;

    // service_providers row
    await run(`
      INSERT INTO "service_providers" (
        user_id, faith, city, latitude, longitude,
        avg_rating, total_sessions, bio, is_online, is_verified, kyc_status,
        commission_rate, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,true,'approved',0.18,NOW(),NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        city=EXCLUDED.city, avg_rating=EXCLUDED.avg_rating, bio=EXCLUDED.bio
    `, [userId, p.faith, p.city, p.lat, p.lng, p.rating, p.sessions, p.bio]);
  }
  console.log('✔  Sample priests seeded (6 providers)');

  // ── 5. Sample temples / holy places ───────────────────────────────────────
  const temples = [
    { name: 'Kashi Vishwanath Temple', city: 'Varanasi', faith: 'hindu',     lat: 25.3109, lng: 83.0107, address: 'Lahori Tola, Varanasi, UP 221001' },
    { name: 'Jama Masjid',             city: 'Delhi',    faith: 'muslim',    lat: 28.6507, lng: 77.2334, address: 'Jama Masjid, Chandni Chowk, Delhi 110006' },
    { name: 'Sacred Heart Cathedral',  city: 'Delhi',    faith: 'christian', lat: 28.6304, lng: 77.2177, address: '1 Ashoka Pl, New Delhi 110001' },
    { name: 'Golden Temple (Harmandir Sahib)', city: 'Amritsar', faith: 'sikh', lat: 31.6200, lng: 74.8765, address: 'Golden Temple Rd, Amritsar, Punjab 143006' },
    { name: 'ISKCON Temple',           city: 'Mumbai',   faith: 'hindu',     lat: 19.1033, lng: 72.8369, address: 'Hare Krishna Land, Juhu, Mumbai 400049' },
    { name: 'St. Francis of Assisi Church', city: 'Goa', faith: 'christian', lat: 15.5009, lng: 73.9113, address: 'Old Goa Rd, Velha Goa 403402' },
  ];

  for (const t of temples) {
    await run(`
      INSERT INTO "places" (name, city, faith, latitude, longitude, address, is_verified, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())
      ON CONFLICT DO NOTHING
    `, [t.name, t.city, t.faith, t.lat, t.lng, t.address]);
  }
  console.log('✔  Sample temples seeded (6 places)');

  // ── 6. Discount codes ─────────────────────────────────────────────────────
  const codes = [
    { code: 'WELCOME50',  type: 'percent', value: 50, min_order: 0,    max_uses: 10000, expires_days: 90  },
    { code: 'PUJA100',    type: 'flat',    value: 100,min_order: 500,  max_uses: 5000,  expires_days: 60  },
    { code: 'DIWALI20',   type: 'percent', value: 20, min_order: 1000, max_uses: 2000,  expires_days: 30  },
    { code: 'FIRSTBOOK',  type: 'percent', value: 30, min_order: 0,    max_uses: 50000, expires_days: 365 },
  ];
  for (const c of codes) {
    await run(`
      INSERT INTO "discount_codes" (
        code, discount_type, discount_value, min_order_inr,
        max_uses, uses_count, valid_from, valid_until, is_active, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,0,NOW(), NOW() + INTERVAL '${c.expires_days} days',true,NOW(),NOW())
      ON CONFLICT (code) DO NOTHING
    `, [c.code, c.type, c.value, c.min_order, c.max_uses]);
  }
  console.log('✔  Discount codes seeded (4 codes)');

  // ── 7. Feature flags ──────────────────────────────────────────────────────
  const flags = [
    { key: 'online_consultation',  enabled: true,  description: 'Socket-based per-minute consultation' },
    { key: 'wallet_topup',         enabled: true,  description: 'Razorpay wallet top-up flow' },
    { key: 'ai_astrology',         enabled: true,  description: 'AI kundli + daily horoscope via GPT' },
    { key: 'social_feed',          enabled: true,  description: 'Community posts + reactions' },
    { key: 'live_streaming',       enabled: false, description: 'Provider live puja streaming (phase 2)' },
    { key: 'referral_program',     enabled: false, description: 'Refer-a-friend cashback (phase 2)' },
  ];
  for (const ff of flags) {
    await run(`
      INSERT INTO "feature_flags" (key, enabled, description, created_at, updated_at)
      VALUES ($1,$2,$3,NOW(),NOW())
      ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled, description=EXCLUDED.description
    `, [ff.key, ff.enabled, ff.description]);
  }
  console.log('✔  Feature flags seeded (6 flags)');

  await AppDataSource.destroy();
  console.log('\n🌱  Seed complete!');
}

seed().catch(e => { console.error('❌  Seed failed:', e.message); process.exit(1); });
