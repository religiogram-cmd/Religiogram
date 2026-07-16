import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';

export const metadata: Metadata = {
  title: 'Contact ReligioGram — Support, Press, Partnerships',
  description:
    "Get in touch with ReligioGram. Support for consultations, priest bookings, wallet issues, provider onboarding, press inquiries, and partnerships.",
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact ReligioGram',
    description: 'Support, press, partnerships. Typical response within 24 hours.',
    url: `${SITE_URL}/contact`,
    type: 'article',
  },
};

/* ContactPage + ContactPoint schema — helps Google display contact info
 * in knowledge panels and lets LLMs answer "how to contact ReligioGram"
 * with structured data instead of scraped HTML. */
const contactJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': `${SITE_URL}/contact#contactpage`,
  url: `${SITE_URL}/contact`,
  name: 'Contact ReligioGram',
  description: metadata.description,
  isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website` },
  mainEntity: {
    '@type': 'Organization',
    name: 'ReligioGram',
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon-hires.png`,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@religiogram.com',
        areaServed: 'IN',
        availableLanguage: ['en', 'hi'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'press inquiries',
        email: 'support@religiogram.com',
        areaServed: 'IN',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'partnerships',
        email: 'support@religiogram.com',
        areaServed: 'IN',
      },
    ],
  },
};

interface ContactRoute {
  label: string;
  desc: string;
  email: string;
  subject?: string;
}

const ROUTES: ContactRoute[] = [
  {
    label: 'General Support',
    desc: 'Bookings, wallet issues, consultation questions, account help',
    email: 'support@religiogram.com',
    subject: 'Support%20Request',
  },
  {
    label: 'Provider Onboarding',
    desc: "Pandits, Imams, Granthis, Priests, and astrologers who want to join ReligioGram",
    email: 'support@religiogram.com',
    subject: 'Provider%20Onboarding',
  },
  {
    label: 'Press & Media',
    desc: 'Journalists, bloggers, and podcasters covering religion, technology, or spirituality',
    email: 'support@religiogram.com',
    subject: 'Press%20Inquiry',
  },
  {
    label: 'Partnerships',
    desc: 'Temples, religious institutions, and brands interested in collaborating',
    email: 'support@religiogram.com',
    subject: 'Partnership%20Inquiry',
  },
  {
    label: 'Privacy & Data Requests',
    desc: 'DPDP Act compliance, account deletion, data export, or privacy concerns',
    email: 'support@religiogram.com',
    subject: 'Privacy%20Request',
  },
  {
    label: 'Security Disclosures',
    desc: 'Responsibly disclose a security vulnerability — see /.well-known/security.txt',
    email: 'support@religiogram.com',
    subject: 'Security%20Disclosure',
  },
];

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
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
          lineHeight: 1.65,
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
          Contact ReligioGram
        </h1>
        <p style={{ fontSize: 17, color: '#5A4A38', marginBottom: 40 }}>
          We respond to every message within 24 hours (Mon–Sat, 9 AM – 8 PM IST).
          Pick the category that fits your request so we can route it to the
          right team.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ROUTES.map((r) => (
            <a
              key={r.label}
              href={`mailto:${r.email}?subject=${r.subject ?? ''}`}
              style={{
                display: 'block',
                background: '#fff',
                padding: '18px 22px',
                borderRadius: 16,
                border: `1.5px solid ${GOLD_L}30`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 800,
                    color: NAVY,
                    fontFamily: '"Playfair Display", Georgia, serif',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {r.label}
                </p>
                <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>
                  Email →
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: '#5A4A38', lineHeight: 1.55 }}>
                {r.desc}
              </p>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12.5,
                  color: '#8B6B35',
                  fontFamily: 'monospace',
                }}
              >
                {r.email}
              </p>
            </a>
          ))}
        </div>

        <section style={{ marginTop: 48 }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: NAVY,
              fontFamily: '"Playfair Display", Georgia, serif',
              letterSpacing: '-0.015em',
              marginBottom: 12,
            }}
          >
            Business address
          </h2>
          <address
            style={{
              fontStyle: 'normal',
              fontSize: 15,
              color: '#4A3010',
              lineHeight: 1.7,
            }}
          >
            ReligioGram
            <br />
            India
          </address>
        </section>

        <section style={{ marginTop: 32 }}>
          <p style={{ fontSize: 14, color: '#5A4A38' }}>
            Looking for something specific?{' '}
            <Link href="/faq" style={{ color: GOLD, fontWeight: 700, textDecoration: 'underline' }}>
              Check our FAQ
            </Link>{' '}
            — most questions are answered there.
          </p>
        </section>
      </main>
    </>
  );
}
