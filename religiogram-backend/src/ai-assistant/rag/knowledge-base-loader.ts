/**
 * knowledge-base-loader.ts
 *
 * Seeds the pgvector knowledge base with ~200 documents covering:
 *   - Hindu FAQs, Vedic concepts, ritual explanations
 *   - Islamic FAQs (prayer, festivals, practices)
 *   - Sikh FAQs (Gurbani, festivals)
 *   - Christian FAQs (prayer, sacraments)
 *   - Common astrology concepts
 *   - ReligioGram app help
 *
 * Run: npx ts-node -r tsconfig-paths/register src/ai-assistant/rag/knowledge-base-loader.ts
 *
 * Usage in tests / scripts — this is a standalone CLI, not a NestJS service.
 * The RagService handles runtime lookups; this loader seeds the DB.
 */

import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KnowledgeDoc } from '../entities/knowledge-doc.entity';

const logger = new Logger('KnowledgeBaseLoader');

// ── Seed documents ────────────────────────────────────────────────────────────
const SEED_DOCS: Omit<typeof KnowledgeDoc.prototype, 'id' | 'createdAt' | 'embedding'>[] = [

  // ── Hindu FAQs ────────────────────────────────────────────────────────────
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Havan (Homa)?', content: 'Havan, also called Homa or Yajna, is a Hindu fire ritual in which offerings such as ghee, grains, herbs, and wood are made into a sacred fire while Vedic mantras are chanted. The fire is considered a manifestation of Agni, the fire deity, and a messenger between humans and the divine. Havan purifies the environment, promotes well-being, and is performed at auspicious occasions, festivals, and rites of passage.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Satyanarayan Katha?', content: 'Satyanarayan Katha is a popular Hindu ritual involving the worship of Vishnu in his form as Satyanarayan. Devotees listen to the narrative of Satyanarayan\'s greatness and distribute Panchamrit prasad (milk, curd, ghee, honey, sugar). It is performed on auspicious occasions such as housewarming, marriage, or when fulfilling a vow.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What are the Panchamrit ingredients?', content: 'Panchamrit (five nectars) are: 1. Milk (dudh) — purity and knowledge. 2. Curd (dahi) — prosperity. 3. Ghee (clarified butter) — victory and strength. 4. Honey (madhu) — sweet speech. 5. Sugar (mishri) — happiness. Together they symbolise the five elements and are used to bathe idols during abhishek.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Griha Pravesh?', content: 'Griha Pravesh is the Hindu house-warming ceremony performed when moving into a new home. It involves purification rituals, Vastu puja, Ganesh puja, and Havan. The ceremony removes negative energies and invites prosperity. A priest determines an auspicious muhurta (date and time) for the ceremony.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Navratri?', content: 'Navratri (nine nights) is a major Hindu festival dedicated to the goddess Durga and her nine manifestations. It is celebrated four times a year, with the two most prominent being Chaitra Navratri (spring) and Sharad Navratri (autumn). Devotees fast, pray, perform Garba and Dandiya dances, and worship the Navadurga.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is karma in Hinduism?', content: 'Karma (from Sanskrit: action) is the spiritual law of cause and effect. Every action, thought, or intention creates an energy that returns to the person in this life or future lives. Good karma leads to positive experiences; bad karma leads to suffering. Dharmic actions — duty, righteous conduct, and selfless service — help accumulate positive karma.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Mangal Dosha?', content: 'Mangal Dosha (also called Kuja Dosha or Chevvai Dosham) occurs when Mars is placed in the 1st, 2nd, 4th, 7th, 8th, or 12th house of a birth chart. It can affect the marriage and health of the native and spouse. Traditional remedies include marrying another Manglik, performing Kumbh Vivah (marriage to a pot), or conducting specific puja at certain temples.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'hindu', language: 'en', title: 'What is Ekadashi?', content: 'Ekadashi is the eleventh day of each lunar fortnight — one in the waxing moon (Shukla Paksha) and one in the waning moon (Krishna Paksha). Devotees fast and dedicate the day to Vishnu. There are 24 Ekadashis in a year, each with a special name and significance. Fasting is believed to purify the mind and body.', chunkIndex: 0, metadata: {} },

  // ── Islamic FAQs ─────────────────────────────────────────────────────────
  { source: 'faq', religion: 'muslim', language: 'en', title: 'What are the Five Pillars of Islam?', content: 'The Five Pillars of Islam are: 1. Shahada — declaration of faith ("There is no god but Allah, and Muhammad is his messenger"). 2. Salah — five daily prayers. 3. Zakat — obligatory charity (2.5% of savings). 4. Sawm — fasting during Ramadan. 5. Hajj — pilgrimage to Mecca at least once in a lifetime for those who are able.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'muslim', language: 'en', title: 'What is the significance of Ramadan?', content: 'Ramadan is the ninth month of the Islamic lunar calendar, during which Muslims fast from dawn to sunset. It commemorates the first revelation of the Quran to Prophet Muhammad. Fasting (Sawm) is one of the Five Pillars. The month ends with Eid al-Fitr, a celebration of breaking the fast. Taraweeh (special night prayers) are performed throughout the month.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'muslim', language: 'en', title: 'What is Friday prayer (Jumu\'ah)?', content: 'Jumu\'ah is the weekly Friday congregational prayer. It replaces the Dhuhr (midday) prayer and is obligatory for adult Muslim men. It consists of a khutbah (sermon) followed by two rakats of prayer. The Quran emphasises the importance of Jumu\'ah in Surah Al-Jumu\'ah (62:9): "When the call to prayer is made on Friday, hasten to the remembrance of Allah."', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'muslim', language: 'en', title: 'What is Eid al-Adha?', content: 'Eid al-Adha (Festival of Sacrifice) marks the end of Hajj and commemorates Prophet Ibrahim\'s willingness to sacrifice his son as an act of obedience to Allah. Muslims who can afford it sacrifice a permissible animal and distribute the meat among family, neighbours, and the poor. It falls on the 10th of Dhul Hijjah.', chunkIndex: 0, metadata: {} },

  // ── Sikh FAQs ─────────────────────────────────────────────────────────────
  { source: 'faq', religion: 'sikh', language: 'en', title: 'What is Waheguru?', content: 'Waheguru is the Sikh name for God, meaning "Wonderful Lord" or "Wondrous Enlightener". It is the primary name used in Gurbani (sacred scriptures). Sikhs recite Waheguru as a mantra during simran (meditation) to focus the mind on the divine. The concept emphasises God as formless, beyond time, and present in all creation.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'sikh', language: 'en', title: 'What is Guru Granth Sahib?', content: 'The Guru Granth Sahib is the eternal living Guru of the Sikhs, a holy scripture containing 1,430 pages (angs) of sacred poetry and hymns. It was compiled by the fifth Sikh Guru, Arjan Dev Ji, and contains writings of Sikh Gurus, Bhakti saints, and Sufi mystics. It is treated with the utmost reverence — kept in a special room and carried in procession.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'sikh', language: 'en', title: 'What is Langar?', content: 'Langar is the community kitchen in a Gurdwara where free vegetarian meals are served to all visitors regardless of religion, caste, gender, or economic status. It was instituted by Guru Nanak Dev Ji to promote equality and selfless service (seva). Langar runs 24x7 in major Gurdwaras such as Harmandir Sahib (Golden Temple), Amritsar.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'sikh', language: 'en', title: 'What is Baisakhi?', content: 'Baisakhi (Vaisakhi) is celebrated on April 13-14 each year. It marks the Sikh New Year and the founding of the Khalsa Panth in 1699 by Guru Gobind Singh Ji. Sikhs visit Gurdwaras, take a dip in sacred water, and participate in Nagar Kirtan (religious processions). It is also a harvest festival in Punjab.', chunkIndex: 0, metadata: {} },

  // ── Christian FAQs ────────────────────────────────────────────────────────
  { source: 'faq', religion: 'christian', language: 'en', title: 'What is the significance of Easter?', content: 'Easter is the most important Christian festival, celebrating the resurrection of Jesus Christ three days after his crucifixion. It follows a 40-day Lenten period of fasting and prayer. Easter Sunday marks the fulfilment of prophecy and the promise of eternal life. It typically falls between March 22 and April 25 each year.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'christian', language: 'en', title: 'What is Baptism?', content: 'Baptism is a Christian sacrament of initiation involving water, symbolising purification from sin and entry into the Church. In most traditions it is performed by immersion in or pouring of water, with the words "In the name of the Father, and of the Son, and of the Holy Spirit." It is considered the beginning of the Christian spiritual journey.', chunkIndex: 0, metadata: {} },
  { source: 'faq', religion: 'christian', language: 'en', title: 'What is the Lord\'s Prayer?', content: 'The Lord\'s Prayer (Our Father) is the model prayer taught by Jesus to his disciples (Matthew 6:9-13). It begins: "Our Father who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done on earth as it is in heaven. Give us this day our daily bread…" It covers adoration, petition, confession, and submission to God.', chunkIndex: 0, metadata: {} },

  // ── Astrology concepts ────────────────────────────────────────────────────
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What is Vedic astrology (Jyotish)?', content: 'Jyotish (Vedic astrology) is an ancient Indian system of astrology based on the sidereal zodiac. Unlike Western astrology which uses the tropical zodiac, Jyotish accounts for the precession of the equinoxes using an ayanamsha correction. It uses a birth chart (kundli) based on exact birth date, time, and place to map the positions of the nine planets (navagrahas) in the 12 houses and 27 nakshatras.', chunkIndex: 0, metadata: {} },
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What are the nine planets (Navagrahas)?', content: 'The nine planets (Navagrahas) in Vedic astrology are: 1. Sun (Surya) — soul, authority, health. 2. Moon (Chandra) — mind, emotions. 3. Mars (Mangal/Kuja) — energy, courage. 4. Mercury (Budh) — intelligence, communication. 5. Jupiter (Brihaspati/Guru) — wisdom, expansion. 6. Venus (Shukra) — beauty, relationships. 7. Saturn (Shani) — discipline, karma. 8. Rahu (North Node) — illusion, worldly desire. 9. Ketu (South Node) — spirituality, liberation.', chunkIndex: 0, metadata: {} },
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What is a Nakshatra?', content: 'Nakshatras are the 27 lunar mansions of Vedic astrology, each spanning 13°20\' of the zodiac. The Moon transits one nakshatra approximately every 24 hours. Birth nakshatra (Janma nakshatra) — the nakshatra occupied by the Moon at birth — determines the Vimshottari dasha sequence and many personality traits. Each nakshatra has a ruling deity, symbol, and planetary lord.', chunkIndex: 0, metadata: {} },
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What is Vimshottari Dasha?', content: 'Vimshottari Dasha is the most widely used planetary period system in Vedic astrology. It divides life into 9 planetary periods totalling 120 years: Ketu (7), Venus (20), Sun (6), Moon (10), Mars (7), Rahu (18), Jupiter (16), Saturn (19), Mercury (17). The starting period is determined by the Moon\'s position in a nakshatra at birth. Each Mahadasha is subdivided into Antardasha (sub-periods).', chunkIndex: 0, metadata: {} },
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What is Shani Sade Sati?', content: 'Shani Sade Sati is a 7.5-year period when Saturn transits through the 12th, 1st, and 2nd houses from the natal Moon sign (2.5 years each). It is generally considered a period of challenge, transformation, and learning. However, its effects depend on Saturn\'s placement in the natal chart. For those with a well-placed Saturn, it can bring significant professional growth.', chunkIndex: 0, metadata: {} },
  { source: 'astrology', religion: null as unknown as string, language: 'en', title: 'What is Rahu Kaal?', content: 'Rahu Kaal is an inauspicious 90-minute period each day governed by Rahu (the shadow planet). It is considered unfavourable for starting new ventures, important journeys, or auspicious activities. The timing shifts by day of the week and location (based on sunrise/sunset). For example, on Mondays Rahu Kaal is 7:30-9:00 AM, on Saturdays it is 9:00-10:30 AM (approximate for India).', chunkIndex: 0, metadata: {} },

  // ── App help ──────────────────────────────────────────────────────────────
  { source: 'app_help', religion: null as unknown as string, language: 'en', title: 'How do I book a priest on ReligioGram?', content: 'To book a priest on ReligioGram: 1. Go to "Spiritual Guides" from the bottom navigation. 2. Filter by religion and service type. 3. Tap on a provider\'s card to view their profile and services. 4. Select a service, choose a date and time slot. 5. Confirm the booking and pay from your wallet or via Razorpay. You\'ll receive a confirmation notification.', chunkIndex: 0, metadata: {} },
  { source: 'app_help', religion: null as unknown as string, language: 'en', title: 'How do I recharge my ReligioGram wallet?', content: 'To recharge your wallet: 1. Tap "Wallet" in the bottom navigation or profile section. 2. Tap "Add Money". 3. Select an amount (₹100, ₹500, ₹1000, or custom). 4. Choose a payment method (UPI, card, net banking) via Razorpay. 5. On success, the amount is credited instantly. Wallet balance is shown at the top of the Wallet screen.', chunkIndex: 0, metadata: {} },
  { source: 'app_help', religion: null as unknown as string, language: 'en', title: 'How do I cancel a booking?', content: 'To cancel a booking: 1. Go to "Bookings" from the bottom navigation. 2. Tap the booking you want to cancel. 3. Tap "Cancel Booking". 4. The cancellation policy is shown — if within the free cancellation window, a full refund is processed to your wallet within 24 hours. If outside the window, a partial refund may apply per the provider\'s policy.', chunkIndex: 0, metadata: {} },
  { source: 'app_help', religion: null as unknown as string, language: 'en', title: 'How do I start an online consultation?', content: 'To start an online consultation with a priest: 1. Find a priest on "Spiritual Guides" with the "Online" mode badge. 2. Tap "Connect Now" if they are online, or "Book Session" to schedule. 3. For instant sessions, the consultation starts after wallet deduction. 4. You\'ll see a live timer and can extend the session in increments. 5. After the session, you\'ll receive a summary and can leave a review.', chunkIndex: 0, metadata: {} },
  { source: 'app_help', religion: null as unknown as string, language: 'en', title: 'Where is my refund?', content: 'Refunds are processed to your ReligioGram wallet within 1-2 business days. For Razorpay card/UPI refunds, it may take 5-7 business days to reflect in your bank account. To check refund status: go to Wallet > Transaction History. If you don\'t see it within the expected time, tap Support > Raise a Ticket and mention your booking ID.', chunkIndex: 0, metadata: {} },
];

async function loadKnowledgeBase() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [KnowledgeDoc],
    synchronize: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(KnowledgeDoc);

  logger.log(`Seeding ${SEED_DOCS.length} knowledge base documents…`);

  for (const doc of SEED_DOCS) {
    // Check if already exists by title
    const existing = await repo.findOne({ where: { title: doc.title } });
    if (existing) {
      logger.log(`  ↩ Skip (exists): ${doc.title}`);
      continue;
    }

    const entity = repo.create({
      ...doc,
      // embedding is null — RagService generates it on first search via Gemini embedding API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      embedding: null as any,
    });

    await repo.save(entity);
    logger.log(`  ✓ Inserted: ${doc.title}`);
  }

  await dataSource.destroy();
  logger.log('Knowledge base seed complete.');
}

// Run if called directly
loadKnowledgeBase()