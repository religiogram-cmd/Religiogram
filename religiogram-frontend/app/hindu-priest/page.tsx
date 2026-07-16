import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';
const PAGE_URL = `${SITE_URL}/hindu-priest`;

export const metadata: Metadata = {
  title: 'Hindu Pandits Online — Book Verified Pujas, Havans & Ceremonies | ReligioGram',
  description:
    'Book verified Hindu Pandits and Purohits online for Satyanarayan Katha, Griha Pravesh, weddings, Naamkaran, Havan, Rudrabhishek, Navgraha Shanti and all Vedic rituals. KYC-checked priests, transparent pricing, all-India coverage.',
  alternates: { canonical: '/hindu-priest' },
  keywords: [
    'hindu pandit online',
    'book pandit for puja',
    'purohit near me',
    'satyanarayan katha pandit',
    'griha pravesh pandit',
    'vedic priest booking',
    'hindu wedding pandit',
    'havan pandit online',
  ],
  openGraph: {
    title: 'Hindu Pandits Online — Book Verified Pujas & Ceremonies',
    description:
      'Verified Hindu Pandits and Purohits for every Vedic ritual — Satyanarayan Katha, Griha Pravesh, weddings, havan and more. Transparent pricing, all-India service.',
    url: PAGE_URL,
    type: 'website',
    siteName: 'ReligioGram',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hindu Pandits Online — Book Verified Pujas & Ceremonies',
    description:
      'Verified Hindu Pandits and Purohits for every Vedic ritual. Book in minutes on ReligioGram.',
  },
};

interface Ritual { name: string; blurb: string; }
interface Step { title: string; blurb: string; }
interface FAQ { q: string; a: string; }

const RITUALS: Ritual[] = [
  { name: 'Satyanarayan Katha', blurb: 'Vishnu narration and prasad ceremony performed on full-moon days, promotions, and new beginnings.' },
  { name: 'Griha Pravesh', blurb: 'Traditional housewarming with Vastu shanti, Ganesh puja and havan before moving in.' },
  { name: 'Hindu Wedding', blurb: 'Complete Vivah Sanskar including Kanyadaan, Saptapadi, Mangalphere and Grihaprevesh rites.' },
  { name: 'Naamkaran Sanskar', blurb: 'Vedic baby naming ceremony on the 11th or 12th day after birth per family tradition.' },
  { name: 'Havan & Yagya', blurb: 'Sacred fire rituals for purification, prosperity and specific sankalpa such as career or health.' },
  { name: 'Rudrabhishek', blurb: 'Powerful Shiva worship with milk, honey and Rudra mantras — ideal on Mondays and Shivratri.' },
  { name: 'Navgraha Shanti', blurb: 'Nine-planet pacification puja to counter malefic planetary dashas and doshas in the Kundli.' },
  { name: 'Mangal Dosh Puja', blurb: 'Traditional remedy for Manglik natives before marriage to neutralise Mars afflictions.' },
];

const STEPS: Step[] = [
  { title: 'Browse Pandits', blurb: 'Pick a ritual or filter by faith, city and language. See verified Pandits with ratings, price bands and availability.' },
  { title: 'Book instantly', blurb: 'Confirm date, time and address. The Pandit accepts within a few hours and shares the samagri list.' },
  { title: 'Priest arrives', blurb: 'A KYC-verified Pandit or Purohit arrives at your home or venue with mantras, sankalpa and materials.' },
  { title: 'Pay via wallet', blurb: 'Settle securely through your ReligioGram wallet (Razorpay-backed). Rate the Pandit and download the receipt.' },
];

const FAQS: FAQ[] = [
  {
    q: 'How do I book a Hindu Pandit for a puja at home?',
    a: 'Open the Rituals section, choose your puja (e.g. Satyanarayan Katha), pick a nearby verified Pandit and confirm the date and address. The priest arrives at your home with the required mantras and, if agreed, the samagri.',
  },
  {
    q: 'Are the Pandits on ReligioGram genuine Purohits?',
    a: 'Yes. Every Pandit undergoes KYC — Aadhaar and PAN check, live selfie, video verification and credential review — before appearing in search. We also track user ratings after each puja.',
  },
  {
    q: 'How much does a Hindu Pandit charge for a puja?',
    a: 'Prices start from around ₹500 for a Daily Ghar Puja and go up to ₹21,000+ for a complete wedding. Satyanarayan Katha typically starts near ₹2,100. Every Pandit lists a transparent price band based on complexity, samagri and duration.',
  },
  {
    q: 'Can I book a Pandit who speaks Hindi, Marathi, Tamil or Telugu?',
    a: 'Yes. Every Pandit profile lists the languages they speak and the tradition they follow (Smarta, Vaishnav, Shaiva, etc.). Filter by language and sect while browsing to find a match for your family tradition.',
  },
];

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Hindu Priest', item: PAGE_URL },
  ],
};

const serviceLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${PAGE_URL}#service`,
  serviceType: 'Hindu Pandit & Purohit Booking',
  name: 'Verified Hindu Pandits Online',
  description:
    'Book verified Hindu Pandits and Purohits for Satyanarayan Katha, Griha Pravesh, weddings, Naamkaran, Havan, Rudrabhishek and other Vedic rituals across India.',
  provider: {
    '@type': 'Organization',
    name: 'ReligioGram',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon-hires.png`,
  },
  areaServed: { '@type': 'Country', name: 'India' },
  audience: { '@type': 'Audience', audienceType: 'Hindu families and devotees' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'INR',
    lowPrice: '500',
    highPrice: '21000',
    offerCount: RITUALS.length,
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Hindu Rituals',
    itemListElement: RITUALS.map((r) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: r.name, description: r.blurb },
    })),
  },
};

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function HinduPriestPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <main
        style={{
          minHeight: '100svh',
          background: CREAM,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          color: TEXT2,
          padding: '48px 20px 96px',
          maxWidth: 820,
          margin: '0 auto',
          lineHeight: 1.7,
        }}
      >
        <nav style={{ marginBottom: 24, fontSize: 13 }}>
          <Link href="/" style={{ color: GOLD, textDecoration: 'none', fontWeight: 700 }}>
            ← Home
          </Link>
        </nav>

        <h1
          style={{
            fontSize: 40,
            fontWeight: 900,
            color: NAVY,
            fontFamily: '"Playfair Display", Georgia, serif',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 14,
          }}
        >
          Hindu Pandits Online — Book Verified Pujas &amp; Ceremonies
        </h1>

        <p style={{ fontSize: 18, color: '#5A4A38', marginBottom: 32 }}>
          Sanatana Dharma is lived through samskaras — from Naamkaran at birth to Antim Sanskar at
          the end of life. ReligioGram brings verified Pandits, Purohits and Vedic scholars to
          your home or venue so every ritual is performed with proper mantras, correct muhurat and
          full devotion.
        </p>

        <section style={{ marginBottom: 40 }}>
          <p style={p}>
            Whether you are welcoming a new home with a <strong>Griha Pravesh</strong>, celebrating
            a promotion with a <strong>Satyanarayan Katha</strong>, or seeking planetary relief
            with a <strong>Navgraha Shanti Havan</strong>, our platform gives you access to
            KYC-verified Pandits who speak your language and follow your family&apos;s tradition
            — Smarta, Vaishnav, Shaiva or Shakta. Each Pandit lists their experience, the
            gotras and sects they serve, the samagri they can supply and a transparent price band.
            No haggling, no hidden fees, no last-minute surprises.
          </p>
          <p style={p}>
            Bookings are fully digital: browse, confirm the muhurat, and the priest arrives at your
            doorstep with sankalpa and shastra-shuddha rituals. Payment happens securely through
            your ReligioGram wallet after the puja is complete.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>What we help with</h2>
          <ul style={{ paddingLeft: 22 }}>
            {RITUALS.map((r) => (
              <li key={r.name} style={li}>
                <strong>{r.name}</strong> — {r.blurb}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>How it works</h2>
          <ol style={{ paddingLeft: 22, marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <li key={i} style={li}>
                <strong>{s.title}</strong> — {s.blurb}
              </li>
            ))}
          </ol>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Why choose ReligioGram</h2>
          <ul style={{ paddingLeft: 22 }}>
            <li style={li}><strong>KYC-verified Pandits only</strong> — Aadhaar, PAN, live selfie and video verification before any priest goes live.</li>
            <li style={li}><strong>Transparent pricing</strong> — see the price band up-front. No dakshina bargaining, no post-puja surprises.</li>
            <li style={li}><strong>All-India coverage</strong> — Pandits available across metros, Tier-2 and Tier-3 cities. Remote / live-streamed pujas for the diaspora.</li>
            <li style={li}><strong>Wallet-secured payments</strong> — Razorpay-backed wallet with refundable holds and full transaction ledger.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Common questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FAQS.map((f, i) => (
              <details key={i} style={faqCard}>
                <summary style={faqSummary}>{f.q}</summary>
                <p style={faqAnswer}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Explore more</h2>
          <p style={p}>
            Popular Hindu services:{' '}
            <Link href="/services/satyanarayan-katha" style={inlineLink}>Satyanarayan Katha</Link>,{' '}
            <Link href="/services/griha-pravesh" style={inlineLink}>Griha Pravesh</Link>,{' '}
            <Link href="/services/mangal-dosh-puja" style={inlineLink}>Mangal Dosh Puja</Link>,{' '}
            <Link href="/services/kundli-matching" style={inlineLink}>Kundli Matching</Link>.
          </p>
          <p style={p}>
            Looking for Pandits in a specific city?{' '}
            <Link href="/pandits/mumbai" style={inlineLink}>Mumbai</Link>,{' '}
            <Link href="/pandits/delhi" style={inlineLink}>Delhi</Link>,{' '}
            <Link href="/pandits/bengaluru" style={inlineLink}>Bengaluru</Link>,{' '}
            <Link href="/pandits/pune" style={inlineLink}>Pune</Link>.
          </p>
        </section>

        <div style={ctaBox}>
          <p style={ctaHeading}>Ready to book a Pandit?</p>
          <p style={ctaSubtext}>Browse verified Hindu priests and pick the ritual you need.</p>
          <Link href="/rituals?faith=hindu" style={ctaButton}>
            Browse Hindu rituals
          </Link>
        </div>
      </main>
    </>
  );
}

/* ── shared inline styles ── */
const sectionHeading = {
  fontSize: 24,
  fontWeight: 800,
  color: NAVY,
  fontFamily: '"Playfair Display", Georgia, serif',
  letterSpacing: '-0.015em',
  marginBottom: 12,
  marginTop: 0,
} as const;

const p = { fontSize: 15.5, marginBottom: 14 } as const;
const li = { fontSize: 15.5, marginBottom: 10 } as const;
const inlineLink = { color: GOLD, fontWeight: 700, textDecoration: 'underline' } as const;

const faqCard = {
  background: '#fff',
  borderRadius: 14,
  padding: '14px 18px',
  border: '1.5px solid rgba(200,146,10,0.18)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
} as const;

const faqSummary = {
  cursor: 'pointer',
  fontSize: 15.5,
  fontWeight: 800,
  color: NAVY,
  fontFamily: '"Playfair Display", Georgia, serif',
  listStyle: 'none',
} as const;

const faqAnswer = {
  marginTop: 10,
  marginBottom: 0,
  fontSize: 14.5,
  color: TEXT2,
  lineHeight: 1.6,
} as const;

const ctaBox = {
  marginTop: 60,
  padding: '26px 24px 28px',
  background: 'linear-gradient(135deg,#0F2452 0%,#1A3168 100%)',
  borderRadius: 20,
  color: CREAM,
  textAlign: 'center' as const,
  border: `1.5px solid ${GOLD_L}55`,
};

const ctaHeading = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  fontFamily: '"Playfair Display", Georgia, serif',
  color: GOLD_L,
} as const;

const ctaSubtext = {
  margin: '6px 0 18px',
  fontSize: 14,
  color: 'rgba(255,250,236,0.78)',
} as const;

const ctaButton = {
  display: 'inline-block',
  background: `linear-gradient(135deg,${GOLD},${GOLD_L})`,
  color: NAVY,
  fontWeight: 800,
  padding: '12px 28px',
  borderRadius: 100,
  textDecoration: 'none',
  fontSize: 14,
  boxShadow: '0 4px 14px rgba(200,146,10,0.35)',
} as const;
