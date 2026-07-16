import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';
const PAGE_URL = `${SITE_URL}/sikh-granthi`;

export const metadata: Metadata = {
  title: 'Sikh Granthis & Ragis Online — Book Anand Karaj, Akhand Path | ReligioGram',
  description:
    'Book verified Sikh Granthis and Ragis online for Anand Karaj, Naam Karan, Akhand Path, Sukhmani Sahib Path, Antim Ardas and Dastar Bandi. KYC-verified, Gurmat-compliant, all-India coverage.',
  alternates: { canonical: '/sikh-granthi' },
  keywords: [
    'sikh granthi online',
    'book granthi for anand karaj',
    'akhand path booking',
    'sukhmani sahib path granthi',
    'ragi jatha booking',
    'sikh wedding granthi',
    'antim ardas granthi',
  ],
  openGraph: {
    title: 'Sikh Granthis & Ragis Online — Anand Karaj, Akhand Path, Kirtan',
    description:
      'Verified Sikh Granthis and Ragis for every Gurmat ceremony — Anand Karaj, Akhand Path, Sukhmani Sahib and more. Book online with transparent pricing.',
    url: PAGE_URL,
    type: 'website',
    siteName: 'ReligioGram',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sikh Granthis & Ragis Online',
    description: 'Book verified Sikh Granthis and Ragis for Anand Karaj, Akhand Path and more on ReligioGram.',
  },
};

interface Ritual { name: string; blurb: string; }
interface Step { title: string; blurb: string; }
interface FAQ { q: string; a: string; }

const RITUALS: Ritual[] = [
  { name: 'Anand Karaj', blurb: 'Sikh wedding ceremony with four Lavan around Guru Granth Sahib Ji, performed by a Granthi with Ragi Jatha.' },
  { name: 'Naam Karan', blurb: 'Baby naming ceremony where the first letter is drawn from a random Hukamnama in Guru Granth Sahib Ji.' },
  { name: 'Akhand Path', blurb: 'Continuous 48-hour uninterrupted recitation of the complete Guru Granth Sahib Ji, typically by three Granthis in rotation.' },
  { name: 'Sukhmani Sahib Path', blurb: 'Recitation of the 24-Ashtapadi Sukhmani Sahib Bani for peace of mind and family blessings.' },
  { name: 'Kirtan', blurb: 'Devotional Gurbani sung by trained Ragi Jatha at home or Gurdwara for special occasions.' },
  { name: 'Antim Ardas', blurb: 'Final farewell prayer performed by a Granthi after the Bhog of Sehaj Path following a family passing.' },
  { name: 'Dastar Bandi', blurb: 'Turban-tying ceremony marking a Sikh child\'s formal adoption of the Dastar and adult identity.' },
];

const STEPS: Step[] = [
  { title: 'Browse Granthis', blurb: 'Filter by ceremony, city, language (Punjabi, Hindi, English) and Ragi Jatha availability.' },
  { title: 'Book instantly', blurb: 'Confirm date, time and venue. The Granthi accepts within a few hours and shares any Saroop or preparation notes.' },
  { title: 'Granthi arrives', blurb: 'A KYC-verified Granthi (with Ragi Jatha if booked) arrives on time and performs the ceremony per Sikh Rehat Maryada.' },
  { title: 'Pay via wallet', blurb: 'Pay securely through the ReligioGram wallet (Razorpay-backed). Rate the Granthi and download the receipt.' },
];

const FAQS: FAQ[] = [
  {
    q: 'How do I book a Granthi for Anand Karaj?',
    a: 'Open Rituals, choose Sikh, select Anand Karaj, pick a verified Granthi in your city and confirm the date and venue (Gurdwara or home). Ragi Jatha for the four Lavan can be added while booking.',
  },
  {
    q: 'Are the Granthis on ReligioGram verified?',
    a: 'Yes. Every Granthi and Ragi undergoes KYC — Aadhaar and PAN check, live selfie, video verification and credential review. Ratings from real Sangat members are visible on each profile.',
  },
  {
    q: 'How is Akhand Path arranged at home?',
    a: 'You need a clean sanctified space with the Saroop of Sri Guru Granth Sahib Ji, a Manji Sahib, Rumalas and Chanani. Three Granthis take turns to recite continuously for 48 hours ending with Bhog and Ardas. ReligioGram Granthis guide you through the full setup.',
  },
  {
    q: 'How much does a Granthi charge for Sukhmani Sahib or Anand Karaj?',
    a: 'Sukhmani Sahib Path typically starts near ₹2,100 and Anand Karaj from ₹5,100 for the Granthi (Ragi Jatha and Langar are separate). Akhand Path starts from around ₹11,000. Every Granthi shows a transparent price band before you book.',
  },
];

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Sikh Granthi', item: PAGE_URL },
  ],
};

const serviceLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${PAGE_URL}#service`,
  serviceType: 'Sikh Granthi & Ragi Booking',
  name: 'Verified Sikh Granthis Online',
  description:
    'Book verified Sikh Granthis and Ragi Jathas for Anand Karaj, Naam Karan, Akhand Path, Sukhmani Sahib, Antim Ardas and Dastar Bandi across India.',
  provider: {
    '@type': 'Organization',
    name: 'ReligioGram',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon-hires.png`,
  },
  areaServed: { '@type': 'Country', name: 'India' },
  audience: { '@type': 'Audience', audienceType: 'Sikh families and Sangat' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'INR',
    lowPrice: '1500',
    highPrice: '15000',
    offerCount: RITUALS.length,
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Sikh Ceremonies',
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

export default function SikhGranthiPage() {
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
          Sikh Granthis &amp; Ragis Online — Book Anand Karaj &amp; Akhand Path
        </h1>

        <p style={{ fontSize: 18, color: '#5A4A38', marginBottom: 32 }}>
          Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh. From the joyous Anand Karaj to the solemn
          Antim Ardas, every Sikh ceremony deserves a Granthi who follows the Sikh Rehat Maryada
          and treats the Saroop of Sri Guru Granth Sahib Ji with the highest respect. ReligioGram
          connects Sangat across India with verified Granthis and Ragi Jathas.
        </p>

        <section style={{ marginBottom: 40 }}>
          <p style={p}>
            Whether you&apos;re planning an <strong>Anand Karaj</strong> at your local Gurdwara,
            arranging a home <strong>Sukhmani Sahib Path</strong> for family peace, or organising a
            48-hour <strong>Akhand Path</strong> with rotating Granthis — every provider on
            ReligioGram has completed KYC verification and credential review. Ragi Jatha bookings
            with Tabla and Vaja support are available as add-ons for weddings and Kirtan Darbars.
          </p>
          <p style={p}>
            All prices are transparent and set upfront. Bookings can be made for your home,
            Gurdwara Sahib or event venue. Payments are secured through your ReligioGram wallet
            after the Bhog and Ardas are complete.
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
            <li style={li}><strong>KYC-verified Granthis and Ragis</strong> — Aadhaar, PAN, live selfie and video verification.</li>
            <li style={li}><strong>Transparent pricing</strong> — clear Granthi and Ragi Jatha fees. No surprises after the Bhog.</li>
            <li style={li}><strong>All-India coverage</strong> — Granthis available in Punjab, Delhi, Mumbai, Bengaluru and every Tier-2 city with a Sikh Sangat.</li>
            <li style={li}><strong>Wallet-secured payments</strong> — Razorpay-backed wallet with refundable holds and a full transaction ledger.</li>
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
            Popular Sikh services:{' '}
            <Link href="/services/anand-karaj" style={inlineLink}>Anand Karaj</Link>,{' '}
            <Link href="/rituals?faith=sikh" style={inlineLink}>All Sikh ceremonies</Link>.
          </p>
          <p style={p}>
            Explore other faiths:{' '}
            <Link href="/hindu-priest" style={inlineLink}>Hindu Pandit</Link>,{' '}
            <Link href="/muslim-imam" style={inlineLink}>Muslim Imam</Link>,{' '}
            <Link href="/christian-priest" style={inlineLink}>Christian Priest</Link>.
          </p>
        </section>

        <div style={ctaBox}>
          <p style={ctaHeading}>Ready to book a Granthi?</p>
          <p style={ctaSubtext}>Browse verified Sikh Granthis and Ragi Jathas for your ceremony.</p>
          <Link href="/rituals?faith=sikh" style={ctaButton}>
            Browse Sikh ceremonies
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
