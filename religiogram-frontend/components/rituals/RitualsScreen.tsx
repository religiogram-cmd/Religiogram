'use client';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const GOLD = '#C8920A';
const NAVY = '#0A1628';
const PARCH = '#F5E6C0';

const FAITH_META: Record<string, { color: string; emoji: string; label: string }> = {
  hindu:    { color: '#FF7043', emoji: '🪔', label: 'Hindu'     },
  muslim:   { color: '#2E7D52', emoji: '☪️', label: 'Muslim'    },
  sikh:     { color: '#E65100', emoji: '🟠', label: 'Sikh'      },
  christian:{ color: '#5C6BC0', emoji: '✝️', label: 'Christian' },
};

interface RitualEntry {
  /** Machine slug — passed to /priests?service= for filtering. */
  id: string;
  /** Human-readable name that renders on the card. */
  name: string;
  /** One-line description shown under the name. */
  description: string;
  /** Local image path under `public/`. Hindu has a real per-ritual image
   *  catalog; other faiths fall back to a full-bleed hero. */
  image: string;
  /** "From ₹XXX" price hint. Rough band — actual price is set by the
   *  priest at booking time. Kept short so it fits in one card row. */
  priceFrom: number;
  /** Rough duration string ("2 hrs", "30 mins", etc.) */
  duration: string;
  /** Optional grouping: 'daily' | 'festival' | 'life' | 'dosh' | 'online' */
  category: 'daily' | 'festival' | 'life' | 'dosh' | 'online';
}

/**
 * Rich ritual catalog per faith.
 *
 * Hindu has a full 22-ritual set backed by the actual images in
 * `public/priests/hindu/rituals/`. Muslim / Sikh / Christian use the
 * faith hero image as a fallback because per-ritual assets don't exist
 * yet — they still render as proper cards, just with one shared image
 * per faith. Add more assets under `public/priests/<faith>/rituals/`
 * later and swap the `image` field here to point at them.
 *
 * Prices are illustrative "from" bands — the actual price is set by the
 * priest during booking negotiation.
 */
const CATALOG: Record<string, RitualEntry[]> = {
  hindu: [
    // ── Daily / recurring ───────────────────────────────────────────
    { id: 'daily-ghar-puja', name: 'Daily Ghar Puja', description: 'Everyday household worship & aarti', image: '/priests/hindu/rituals/daily-ghar-puja.jpg', priceFrom: 500, duration: '30 mins', category: 'daily' },
    { id: 'satyanarayan-katha', name: 'Satyanarayan Katha', description: 'Vishnu narration & prasad ceremony', image: '/priests/hindu/rituals/satyanarayan-katha.jpg', priceFrom: 2100, duration: '2 hrs', category: 'daily' },
    { id: 'ganesh-puja', name: 'Ganesh Puja', description: 'Blessings for a fresh start', image: '/priests/hindu/rituals/ganesh-puja.jpg', priceFrom: 1500, duration: '1.5 hrs', category: 'daily' },
    { id: 'lakshmi-puja', name: 'Lakshmi Puja', description: 'Prosperity & wealth blessing', image: '/priests/hindu/rituals/lakshmi-puja.jpg', priceFrom: 1800, duration: '1.5 hrs', category: 'daily' },

    // ── Festivals ───────────────────────────────────────────────────
    { id: 'diwali-lakshmi-puja', name: 'Diwali Lakshmi Puja', description: 'Deepavali night worship', image: '/priests/hindu/rituals/diwali-lakshmi-puja.jpg', priceFrom: 2100, duration: '2 hrs', category: 'festival' },
    { id: 'navratri-durga-puja', name: 'Navratri Durga Puja', description: '9-day Devi celebration', image: '/priests/hindu/rituals/navratri-durga-puja.jpg', priceFrom: 5100, duration: '2 hrs / day', category: 'festival' },
    { id: 'ganesh-chaturthi-puja', name: 'Ganesh Chaturthi', description: 'Lord Ganesha welcome ceremony', image: '/priests/hindu/rituals/ganesh-chaturthi-puja.jpg', priceFrom: 2100, duration: '2 hrs', category: 'festival' },
    { id: 'karwa-chauth-puja', name: 'Karwa Chauth', description: 'Married-women moon ritual', image: '/priests/hindu/rituals/karwa-chauth-puja.jpg', priceFrom: 1500, duration: '1 hr', category: 'festival' },
    { id: 'makar-sankranti-puja', name: 'Makar Sankranti Puja', description: 'Solstice offering & havan', image: '/priests/hindu/rituals/makar-sankranti-puja.jpg', priceFrom: 1800, duration: '1.5 hrs', category: 'festival' },
    { id: 'tulsi-vivah', name: 'Tulsi Vivah', description: 'Tulsi-Shaligram wedding ceremony', image: '/priests/hindu/rituals/tulsi-vivah.jpg', priceFrom: 2500, duration: '2 hrs', category: 'festival' },

    // ── Dosh / grah shanti ──────────────────────────────────────────
    { id: 'navgraha-shanti-puja', name: 'Navgraha Shanti Puja', description: '9-planet pacification puja', image: '/priests/hindu/rituals/navgraha-shanti-puja.jpg', priceFrom: 5100, duration: '3 hrs', category: 'dosh' },
    { id: 'kaal-sarp-dosh-puja', name: 'Kaal Sarp Dosh Puja', description: 'Rahu-Ketu affliction remedy', image: '/priests/hindu/rituals/kaal-sarp-dosh-puja.jpg', priceFrom: 7100, duration: '4 hrs', category: 'dosh' },
    { id: 'mangal-dosh-puja', name: 'Mangal Dosh Puja', description: 'Mars affliction remedy', image: '/priests/hindu/rituals/mangal-dosh-puja.jpg', priceFrom: 5100, duration: '3 hrs', category: 'dosh' },
    { id: 'rahu-ketu-shanti', name: 'Rahu Ketu Shanti', description: 'Shadow-planet pacification', image: '/priests/hindu/rituals/rahu-ketu-shanti.jpg', priceFrom: 5100, duration: '3 hrs', category: 'dosh' },
    { id: 'vastu-shanti-puja', name: 'Vastu Shanti Puja', description: 'Home / office energy alignment', image: '/priests/hindu/rituals/vastu-shanti-puja.jpg', priceFrom: 4100, duration: '2.5 hrs', category: 'dosh' },

    // ── Life ceremonies ─────────────────────────────────────────────
    { id: 'griha-pravesh-puja', name: 'Griha Pravesh', description: 'Housewarming ceremony', image: '/priests/hindu/rituals/griha-pravesh-puja.jpg', priceFrom: 5100, duration: '3 hrs', category: 'life' },
    { id: 'naamkaran', name: 'Naamkaran', description: 'Baby naming ceremony', image: '/priests/hindu/rituals/naamkaran.jpg', priceFrom: 2100, duration: '2 hrs', category: 'life' },
    { id: 'mundan', name: 'Mundan Sanskar', description: "First hair-shaving ceremony", image: '/priests/hindu/rituals/mundan.jpg', priceFrom: 1800, duration: '1.5 hrs', category: 'life' },
    { id: 'annaprashan', name: 'Annaprashan', description: 'First-food ceremony', image: '/priests/hindu/rituals/annaprashan.jpg', priceFrom: 2100, duration: '2 hrs', category: 'life' },
    { id: 'wedding-ritual', name: 'Wedding Ceremony', description: 'Complete Hindu marriage rites', image: '/priests/hindu/rituals/wedding-ritual.jpg', priceFrom: 21000, duration: '5-6 hrs', category: 'life' },

    // ── Online / remote ─────────────────────────────────────────────
    { id: 'online-puja-basic', name: 'Online Puja', description: 'Live-streamed from temple', image: '/priests/hindu/rituals/online-puja-basic.jpg', priceFrom: 1100, duration: '1 hr', category: 'online' },
    { id: 'astrology-puja-combo', name: 'Astrology + Puja Combo', description: 'Chart reading + remedy puja', image: '/priests/hindu/rituals/astrology-puja-combo.jpg', priceFrom: 3100, duration: '2 hrs', category: 'online' },
    { id: 'live-temple-puja', name: 'Live Temple Puja', description: 'Watch puja livestream from famous temple', image: '/priests/hindu/rituals/live-temple-puja.jpg', priceFrom: 1500, duration: '1 hr', category: 'online' },
  ],

  muslim: [
    { id: 'nikah',              name: 'Nikah',              description: 'Islamic marriage ceremony',       image: '/priests/muslim-hero.jpg',  priceFrom: 5100, duration: '2 hrs',   category: 'life' },
    { id: 'aqeeqa',             name: 'Aqeeqa',             description: 'Newborn thanksgiving ceremony',   image: '/priests/muslim-hero.jpg',  priceFrom: 3100, duration: '2 hrs',   category: 'life' },
    { id: 'bismillah-ceremony', name: 'Bismillah Ceremony', description: "Child's first reading of Quran",  image: '/priests/muslim-hero.jpg',  priceFrom: 1500, duration: '1 hr',    category: 'life' },
    { id: 'quran-recitation',   name: 'Quran Recitation',   description: 'Full/partial recitation at home', image: '/priests/muslim-hero.jpg',  priceFrom: 1100, duration: 'Flexible',category: 'daily' },
    { id: 'khatam',             name: 'Khatam-al-Quran',    description: 'Completion recitation ceremony',  image: '/priests/muslim-hero.jpg',  priceFrom: 3100, duration: '3 hrs',   category: 'festival' },
    { id: 'islamic-counseling', name: 'Islamic Counseling', description: 'One-on-one spiritual guidance',   image: '/priests/muslim-hero.jpg',  priceFrom: 500,  duration: '30 mins', category: 'online' },
    { id: 'janaza',             name: 'Janaza Prayer',      description: 'Islamic funeral service',         image: '/priests/muslim-hero.jpg',  priceFrom: 2100, duration: '1 hr',    category: 'life' },
  ],

  sikh: [
    { id: 'anand-karaj',   name: 'Anand Karaj',    description: 'Sikh marriage ceremony',           image: '/priests/sikh-hero.jpg', priceFrom: 5100, duration: '3 hrs',   category: 'life' },
    { id: 'naam-karan',    name: 'Naam Karan',     description: 'Baby naming from Guru Granth Sahib',image: '/priests/sikh-hero.jpg', priceFrom: 2100, duration: '2 hrs',   category: 'life' },
    { id: 'akhand-path',   name: 'Akhand Path',    description: '48-hour continuous recitation',    image: '/priests/sikh-hero.jpg', priceFrom: 11000,duration: '48 hrs',  category: 'festival' },
    { id: 'sukhmani-sahib',name: 'Sukhmani Sahib', description: 'Peace-prayer recitation',           image: '/priests/sikh-hero.jpg', priceFrom: 2100, duration: '2 hrs',   category: 'daily' },
    { id: 'kirtan',        name: 'Kirtan',         description: 'Devotional hymns at home',          image: '/priests/sikh-hero.jpg', priceFrom: 3100, duration: '2 hrs',   category: 'festival' },
    { id: 'antim-ardas',   name: 'Antim Ardas',    description: 'Final farewell prayer',             image: '/priests/sikh-hero.jpg', priceFrom: 2100, duration: '1 hr',    category: 'life' },
    { id: 'dastar-bandi',  name: 'Dastar Bandi',   description: 'Turban-tying ceremony',             image: '/priests/sikh-hero.jpg', priceFrom: 1500, duration: '1 hr',    category: 'life' },
  ],

  christian: [
    { id: 'baptism',              name: 'Baptism',              description: 'Christian initiation ceremony', image: '/priests/christian-hero.jpg', priceFrom: 2100, duration: '1 hr',  category: 'life' },
    { id: 'wedding',              name: 'Wedding',              description: 'Church wedding ceremony',       image: '/priests/christian-hero.jpg', priceFrom: 11000,duration: '2 hrs', category: 'life' },
    { id: 'first-communion',      name: 'First Communion',      description: "Child's first Eucharist",       image: '/priests/christian-hero.jpg', priceFrom: 1500, duration: '1 hr',  category: 'life' },
    { id: 'mass',                 name: 'Home Mass',            description: 'Private mass at your home',     image: '/priests/christian-hero.jpg', priceFrom: 2100, duration: '1 hr',  category: 'daily' },
    { id: 'prayer-service',       name: 'Prayer Service',       description: 'Family or house-blessing prayer',image: '/priests/christian-hero.jpg', priceFrom: 1100, duration: '1 hr',  category: 'daily' },
    { id: 'pastoral-counseling',  name: 'Pastoral Counseling',  description: 'Spiritual guidance session',    image: '/priests/christian-hero.jpg', priceFrom: 500,  duration: '30 mins',category: 'online' },
    { id: 'funeral',              name: 'Funeral Service',      description: 'Christian last rites',          image: '/priests/christian-hero.jpg', priceFrom: 3100, duration: '2 hrs', category: 'life' },
  ],
};

const CATEGORY_LABEL: Record<RitualEntry['category'], string> = {
  daily:    'Daily & Regular',
  festival: 'Festivals',
  dosh:     'Grah / Dosh Shanti',
  life:     'Life Ceremonies',
  online:   'Online / Remote',
};

const CATEGORY_ORDER: RitualEntry['category'][] = ['daily', 'festival', 'life', 'dosh', 'online'];

export default function RitualsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* Faith is now driven purely by the URL — the visible faith tab strip
   * was removed in favour of a single-faith view. Users land here with
   * ?faith=hindu (or muslim / sikh / christian) from the Home page's
   * "Explore" cards, and this screen shows that faith's rituals directly.
   * Falls back to 'hindu' if the param is missing or unrecognised. */
  const activeFaith = (() => {
    const f = (searchParams?.get('faith') ?? '').toLowerCase();
    return f in FAITH_META ? f : 'hindu';
  })();

  const rituals = CATALOG[activeFaith] ?? [];

  /* Group the flat list by category so the UI renders section headers
   * ("Daily & Regular", "Festivals", "Life Ceremonies", etc.) instead of
   * one long strip of cards. Categories not represented in the current
   * faith's catalog are simply skipped. */
  const grouped = useMemo(() => {
    const map = new Map<RitualEntry['category'], RitualEntry[]>();
    for (const r of rituals) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, items: map.get(c)! }));
  }, [rituals]);

  const faithColor = FAITH_META[activeFaith]?.color ?? GOLD;

  const goToRitual = (r: RitualEntry) => {
    /* Route to the priest marketplace pre-filtered by faith + service.
     * The Priests screen honours both query params; providers who offer
     * that service surface at the top of the list. */
    router.push(
      `/priests?faith=${activeFaith}&service=${encodeURIComponent(r.name)}`,
    );
  };

  return (
    <div style={{ minHeight: '100svh', background: PARCH, paddingBottom: 96 }}>
      {/* Header — single-faith view. The faith selector strip that used
       * to sit here was removed; users land here from Home's faith cards
       * which already encode the choice in the URL. The title reflects
       * the active faith so it's obvious which catalog is showing. */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top,0px)', padding: '16px 20px 22px' }}>
        <h1 style={{ color: GOLD, fontSize: 22, fontWeight: 800, margin: '0 0 4px', fontFamily: '"Playfair Display",Georgia,serif', paddingTop: 14 }}>
          {FAITH_META[activeFaith]?.emoji} {FAITH_META[activeFaith]?.label} Rituals
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12.5, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
          Book a verified priest for pujas, ceremonies &amp; rituals
        </p>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 12px 0' }}>
        {grouped.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#7A6650', fontSize: 13 }}>
            No rituals catalogued for this faith yet.
          </div>
        ) : (
          grouped.map(({ category, items }) => (
            <section key={category} style={{ marginBottom: 20 }}>
              <h2 style={{
                fontSize: 14, fontWeight: 800, color: NAVY, margin: '4px 8px 10px',
                fontFamily: '"Playfair Display",Georgia,serif', letterSpacing: '-0.01em',
              }}>
                {CATEGORY_LABEL[category]}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 4px' }}>
                {items.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => goToRitual(r)}
                    style={{
                      background: '#fff', borderRadius: 14, padding: 0,
                      border: `1.5px solid ${faithColor}22`, cursor: 'pointer',
                      textAlign: 'left', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/* Image */}
                    <div style={{
                      width: '100%', aspectRatio: '16 / 10',
                      backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%), url(${r.image})`,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                    }} />
                    {/* Body */}
                    <div style={{ padding: '10px 12px 12px' }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, margin: '0 0 3px', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.25 }}>
                        {r.name}
                      </p>
                      <p style={{ fontSize: 11, color: '#5A4A38', margin: '0 0 8px', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.35, minHeight: 28 }}>
                        {r.description}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: faithColor, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                          From ₹{r.priceFrom.toLocaleString('en-IN')}
                        </span>
                        <span style={{ fontSize: 10, color: '#7A6650', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                          {r.duration}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
