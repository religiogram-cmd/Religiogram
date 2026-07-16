import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';

export const metadata: Metadata = {
  title: 'About ReligioGram — India\'s Multi-Faith Spiritual Marketplace',
  description:
    "Learn how ReligioGram verifies every Pandit, Imam, Granthi, and Christian Priest — and why we're building India's most trusted spiritual services platform for Hindu, Muslim, Sikh, and Christian communities.",
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About ReligioGram — India\'s Multi-Faith Spiritual Marketplace',
    description:
      "How we verify every Pandit, Imam, Granthi, and Christian Priest. Our mission to bring trust, transparency, and access to religious services across India.",
    url: `${SITE_URL}/about`,
    type: 'article',
  },
};

/* AboutPage schema — signals E-E-A-T (Experience, Expertise, Authority, Trust)
 * to Google's ranking algorithm. Also gets picked up by LLMs when users ask
 * "what is ReligioGram" or "is ReligioGram legit". */
const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': `${SITE_URL}/about#aboutpage`,
  url: `${SITE_URL}/about`,
  name: 'About ReligioGram',
  description: metadata.description,
  isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website` },
  mainEntity: {
    '@type': 'Organization',
    name: 'ReligioGram',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon-hires.png`,
    foundingDate: '2026',
    foundingLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
    areaServed: 'IN',
    knowsAbout: [
      'Hindu rituals',
      'Muslim ceremonies',
      'Sikh ceremonies',
      'Christian services',
      'Vedic astrology',
      'Kundli matching',
      'Puja and havan',
      'Nikah',
      'Anand Karaj',
      'Baptism',
    ],
    slogan: "India's trusted multi-faith spiritual services marketplace",
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@religiogram.com',
      areaServed: 'IN',
      availableLanguage: ['en', 'hi'],
    },
  },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />

      <main
        style={{
          minHeight: '100svh',
          background: CREAM,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          color: TEXT2,
          padding: '48px 20px 96px',
          maxWidth: 780,
          margin: '0 auto',
          lineHeight: 1.7,
        }}
      >
        <nav style={{ marginBottom: 32, fontSize: 13 }}>
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
            marginBottom: 12,
          }}
        >
          About ReligioGram
        </h1>

        <p style={{ fontSize: 18, color: '#5A4A38', marginBottom: 40 }}>
          India&apos;s first multi-faith spiritual services marketplace — bringing
          verified Pandits, Imams, Granthis, and Christian Priests to devotees
          across the country.
        </p>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Our mission</h2>
          <p style={p}>
            For centuries, families in India have relied on personal referrals or word
            of mouth to find a trustworthy priest for their pujas, ceremonies, and
            life events. That system worked when everyone lived close to their family
            temple — but for millions of Indians in cities, in the diaspora, or in
            multi-faith households, it doesn&apos;t work anymore.
          </p>
          <p style={p}>
            ReligioGram fixes this by bringing verified religious guides and
            trusted astrologers to one platform. Every provider goes through KYC
            verification before they can accept bookings. Every payment is secured
            via Razorpay. Every consultation happens on a transparent per-minute
            billing model with real-time chat and delivery receipts — so families
            get the sanctity of tradition with the reliability of modern tech.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>How we verify providers</h2>
          <p style={p}>
            Every Pandit, Imam, Granthi, or Christian Priest on ReligioGram goes
            through the same four-step verification before they can be found in
            search:
          </p>
          <ol style={{ paddingLeft: 22, marginTop: 12 }}>
            <li style={li}>
              <strong>Identity check</strong> — government-issued ID (PAN + Aadhaar)
              cross-referenced with legal name.
            </li>
            <li style={li}>
              <strong>Live selfie + video KYC</strong> — recorded proof of the
              person behind the profile.
            </li>
            <li style={li}>
              <strong>Credential review</strong> — years of experience, specialisation
              area, and languages spoken are validated against our admin dashboard.
            </li>
            <li style={li}>
              <strong>Ongoing quality</strong> — every rating and review from real
              users compounds into a public score. Providers below our quality
              threshold are removed.
            </li>
          </ol>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>What we offer</h2>
          <ul style={{ paddingLeft: 22 }}>
            <li style={li}>
              <strong>Book Pandits, Imams, Granthis, Christian Priests</strong> — for
              pujas, weddings, funerals, naming ceremonies, house warmings, and any
              religious event at your home or venue
            </li>
            <li style={li}>
              <strong>Live astrology consultations</strong> — chat, voice, or video
              with verified astrologers. Pay per minute via wallet. Personalised
              Kundli reading and horoscope predictions
            </li>
            <li style={li}>
              <strong>Holy places directory</strong> — searchable database of
              temples, mosques, gurudwaras, and churches across India with reviews,
              directions, and event calendars
            </li>
            <li style={li}>
              <strong>Community feed</strong> — devotees across faiths share
              prayers, festivals, and spiritual experiences
            </li>
            <li style={li}>
              <strong>Wallet + secure payments</strong> — Razorpay-backed wallet
              with transparent per-minute billing, refundable holds, and a full
              transaction ledger
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Faiths we serve</h2>
          <p style={p}>
            ReligioGram is genuinely multi-faith. We support Hindu, Muslim, Sikh, and
            Christian communities today, with more traditions being added as our
            community grows. Whether you need a Pandit for a Satyanarayan Katha, an
            Imam for a Nikah, a Granthi for an Anand Karaj, or a Priest for a
            Christian wedding — the same trusted verification and payment layer
            applies.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeading}>Contact us</h2>
          <p style={p}>
            Questions, partnerships, or press?{' '}
            <a
              href="mailto:support@religiogram.com"
              style={{ color: GOLD, fontWeight: 700, textDecoration: 'underline' }}
            >
              support@religiogram.com
            </a>
          </p>
          <p style={{ ...p, marginTop: 12 }}>
            More questions?{' '}
            <Link href="/faq" style={{ color: GOLD, fontWeight: 700, textDecoration: 'underline' }}>
              Read our FAQ
            </Link>
            .
          </p>
        </section>

        <div
          style={{
            marginTop: 60,
            padding: '24px 24px 26px',
            background: 'linear-gradient(135deg,#0F2452 0%,#1A3168 100%)',
            borderRadius: 20,
            color: CREAM,
            textAlign: 'center',
            border: `1.5px solid ${GOLD_L}55`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              fontFamily: '"Playfair Display", Georgia, serif',
              color: GOLD_L,
            }}
          >
            Ready to book your first consultation?
          </p>
          <p style={{ margin: '6px 0 16px', fontSize: 14, color: 'rgba(255,250,236,0.75)' }}>
            Download the app and browse verified providers now.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              background: `linear-gradient(135deg,${GOLD},${GOLD_L})`,
              color: NAVY,
              fontWeight: 800,
              padding: '11px 26px',
              borderRadius: 100,
              textDecoration: 'none',
              fontSize: 14,
              boxShadow: '0 4px 14px rgba(200,146,10,0.35)',
            }}
          >
            Explore ReligioGram
          </Link>
        </div>
      </main>
    </>
  );
}

/* ── shared inline styles for readability ── */
const sectionHeading = {
  fontSize: 24,
  fontWeight: 800,
  color: NAVY,
  fontFamily: '"Playfair Display", Georgia, serif',
  letterSpacing: '-0.015em',
  marginBottom: 12,
  marginTop: 0,
} as const;

const p = {
  fontSize: 15.5,
  marginBottom: 14,
} as const;

const li = {
  fontSize: 15.5,
  marginBottom: 10,
} as const;
