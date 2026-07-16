import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';
const PAGE_URL = `${SITE_URL}/muslim-imam`;

export const metadata: Metadata = {
  title: 'Muslim Imams & Maulanas Online — Book Nikah, Aqeeqa, Janaza | ReligioGram',
  description:
    'Book verified Imams, Maulanas and Qazis online for Nikah, Aqeeqa, Janaza, Quran Recitation, Bismillah and Khatam ceremonies. KYC-verified, transparent pricing, all-India coverage.',
  alternates: { canonical: '/muslim-imam' },
  keywords: [
    'muslim imam online',
    'book imam for nikah',
    'qazi near me',
    'aqeeqa maulana',
    'janaza prayer imam',
    'quran khatam booking',
    'islamic ceremony imam',
  ],
  openGraph: {
    title: 'Muslim Imams & Maulanas Online — Nikah, Aqeeqa, Janaza',
    description:
      'Verified Imams and Qazis for every Islamic ceremony — Nikah, Aqeeqa, Janaza, Quran Khatam and more. Book online with transparent pricing.',
    url: PAGE_URL,
    type: 'website',
    siteName: 'ReligioGram',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Muslim Imams & Maulanas Online',
    description: 'Book verified Imams for Nikah, Aqeeqa, Janaza and more on ReligioGram.',
  },
};

interface Ritual { name: string; blurb: string; }
interface Step { title: string; blurb: string; }
interface FAQ { q: string; a: string; }

const RITUALS: Ritual[] = [
  { name: 'Nikah', blurb: 'Islamic marriage solemnised by a Qazi with Ijab-Qubool, Mahr agreement and Nikahnama signing.' },
  { name: 'Aqeeqa', blurb: 'Newborn thanksgiving on the 7th day, including hair-cutting, name announcement and sacrifice.' },
  { name: 'Janaza Prayer', blurb: 'Islamic funeral prayer performed by an Imam with Ghusl guidance and burial rites.' },
  { name: 'Quran Recitation', blurb: 'Full or partial recitation at your home for blessings, remembrance or specific niyyat.' },
  { name: 'Bismillah Ceremony', blurb: 'The child\'s first reading of the Quran, usually at age 4 years 4 months and 4 days.' },
  { name: 'Khatam-al-Quran', blurb: 'Group completion of the entire Quran recitation, often held during Ramadan or after a passing.' },
  { name: 'Islamic Counseling', blurb: 'One-on-one guidance from a Maulana on family, marriage, ibadah or spiritual questions.' },
];

const STEPS: Step[] = [
  { title: 'Browse Imams', blurb: 'Filter by ceremony, city, madhab (Hanafi, Shafi, etc.) and language. See ratings and availability.' },
  { title: 'Book instantly', blurb: 'Confirm date, time and venue. The Imam accepts within a few hours and shares any preparation notes.' },
  { title: 'Imam arrives', blurb: 'A KYC-verified Imam or Qazi arrives on time, performs the ceremony per Sunnah, and completes documentation.' },
  { title: 'Pay via wallet', blurb: 'Pay securely through the ReligioGram wallet (Razorpay-backed). Rate the Imam and receive the receipt.' },
];

const FAQS: FAQ[] = [
  {
    q: 'How do I book a Qazi for Nikah on ReligioGram?',
    a: 'Open Rituals, select Nikah under Muslim services, choose a verified Qazi in your city, and confirm the date, venue, Mahr amount and witnesses. The Qazi arrives, performs the Nikah per Sunnah and issues a signed Nikahnama.',
  },
  {
    q: 'Are the Imams on ReligioGram verified?',
    a: 'Yes. Every Imam and Maulana undergoes KYC — Aadhaar and PAN check, live selfie, video verification and credential review before appearing in search. Ratings from real users are visible on each profile.',
  },
  {
    q: 'Can I book an Imam for Janaza at short notice?',
    a: 'Yes. Janaza bookings are prioritised in the platform. Verified Imams typically confirm within an hour and can attend for Ghusl guidance, the Janaza Salah at home or mosque, and burial rites.',
  },
  {
    q: 'How much does an Imam charge for Aqeeqa or Nikah?',
    a: 'Aqeeqa typically starts around ₹3,100 and Nikah from ₹5,100 (Qazi fee only — food and venue are separate). Every Imam lists a transparent price band. Quran Khatam sessions and Islamic counselling are also priced up-front.',
  },
];

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Muslim Imam', item: PAGE_URL },
  ],
};

const serviceLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${PAGE_URL}#service`,
  serviceType: 'Muslim Imam & Qazi Booking',
  name: 'Verified Muslim Imams Online',
  description:
    'Book verified Muslim Imams, Maulanas and Qazis for Nikah, Aqeeqa, Janaza, Quran Recitation, Bismillah and Khatam ceremonies across India.',
  provider: {
    '@type': 'Organization',
    name: 'ReligioGram',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon-hires.png`,
  },
  areaServed: { '@type': 'Country', name: 'India' },
  audience: { '@type': 'Audience', audienceType: 'Muslim families and communities' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'INR',
    lowPrice: '500',
    highPrice: '11000',
    offerCount: RITUALS.length,
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Islamic Ceremonies',
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

export default function MuslimImamPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <main style={pageStyle}>
        <nav style={{ marginBottom: 24, fontSize: 13 }}>
          <Link href="/" style={{ color: GOLD, textDecoration: 'none', fontWeight: 700 }}>
            ← Home
          </Link>
        </nav>

        <h1 style={h1Style}>
          Muslim Imams &amp; Maulanas Online — Book Nikah, Aqeeqa &amp; Janaza
        </h1>

        <p style={{ fontSize: 18, color: '#5A4A38', marginBottom: 32 }}>
          Every important moment in a Muslim family&apos;s life — birth, Nikah, Ramadan and
          Janaza — deserves an Imam who is knowledgeable, punctual and respectful of Sunnah.
          ReligioGram brings verified Imams, Maulanas and registered Qazis to your doorstep for
          every Islamic ceremony.
        </p>

        <section style={{ marginBottom: 40 }}>
          <p style={p}>
            From a <strong>Nikah</strong> with proper Ijab-Qubool and Nikahnama, to an{' '}
            <strong>Aqeeqa</strong> on the seventh day, to a <strong>Janaza Salah</strong> at
            short notice — every Imam on the platform has been KYC-verified and credentialed.
            You&apos;ll see madhab (Hanafi, Shafi, Maliki, Hanbali), languages spoken (Urdu,
            Arabic, Hindi, English) and community affiliation on each profile so you can pick an
            Imam who fits your family&apos;s tradition.
          </p>
          <p style={p}>
            Pricing is transparent and set before booking. Documentation, including the signed
            Nikahnama or Aqeeqa record, is issued on the spot. Payments happen securely through
            your ReligioGram wallet after the ceremony is complete.
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
            <li style={li}><strong>KYC-verified Imams only</strong> — Aadhaar, PAN, live selfie and video verification before any Imam or Qazi goes live.</li>
            <li style={li}><strong>Transparent pricing</strong> — clear fees for Nikah, Aqeeqa, Janaza and other ceremonies. No hidden charges.</li>
            <li style={li}><strong>All-India coverage</strong> — Imams available in every major city and Tier-2 town. Same-day Janaza booking supported.</li>
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
            Popular Muslim services:{' '}
            <Link href="/services/nikah" style={inlineLink}>Nikah</Link>,{' '}
            <Link href="/rituals?faith=muslim" style={inlineLink}>All Islamic ceremonies</Link>.
          </p>
          <p style={p}>
            Explore other faiths on ReligioGram:{' '}
            <Link href="/hindu-priest" style={inlineLink}>Hindu Pandit</Link>,{' '}
            <Link href="/sikh-granthi" style={inlineLink}>Sikh Granthi</Link>,{' '}
            <Link href="/christian-priest" style={inlineLink}>Christian Priest</Link>.
          </p>
        </section>

        <div style={ctaBox}>
          <p style={ctaHeading}>Ready to book an Imam?</p>
          <p style={ctaSubtext}>Browse verified Imams, Maulanas and Qazis for your ceremony.</p>
          <Link href="/rituals?faith=muslim" style={ctaButton}>
            Browse Islamic ceremonies
          </Link>
        </div>
      </main>
    </>
  );
}

/* ── shared inline styles ── */
const pageStyle = {
  minHeight: '100svh',
  background: CREAM,
  fontFamily: '"Plus Jakarta Sans", sans-serif',
  color: TEXT2,
  padding: '48px 20px 96px',
  maxWidth: 820,
  margin: '0 auto',
  lineHeight: 1.7,
} as const;

const h1Style = {
  fontSize: 40,
  fontWeight: 900,
  color: NAVY,
  fontFamily: '"Playfair Display", Georgia, serif',
  letterSpacing: '-0.02em',
  lineHeight: 1.15,
  marginBottom: 14,
} as const;

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
