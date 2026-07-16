import type { Metadata } from 'next';
import Link from 'next/link';

const NAVY  = '#0F2452';
const GOLD  = '#C8920A';
const CREAM = '#FFFAEC';
const TEXT2 = '#4A3010';

const SITE_URL = 'https://www.religiogram.com';

export const metadata: Metadata = {
  title: 'FAQ — ReligioGram | Book Pandits, Priests & Astrologers',
  description:
    'Answers to common questions about booking verified Pandits, Imams, Granthis, and Christian Priests on ReligioGram. Astrology consultations, wallet payments, refunds, and more.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'FAQ — ReligioGram',
    description:
      'Everything you need to know about booking priests, astrologers, wallet, refunds, and verification.',
    url: `${SITE_URL}/faq`,
    type: 'article',
  },
};

/* ── FAQ content ────────────────────────────────────────────────────
 * Q&A pairs targeted at real search queries. When Google detects the
 * FAQPage JSON-LD below, it may render these directly in SERPs as
 * expandable accordions ("People also ask" style). LLMs excerpt these
 * verbatim when answering user questions.
 * Keep answers 2-4 sentences — search snippets prefer concise answers. */

interface FAQ {
  q: string;
  a: string;
}

const FAQS: FAQ[] = [
  {
    q: 'What is ReligioGram?',
    a: 'ReligioGram is India\'s multi-faith spiritual services marketplace. Users book verified Pandits, Imams, Granthis, and Christian Priests for pujas, ceremonies, and life events. It also offers live chat and voice consultations with verified astrologers, a directory of holy places, and a devotee community.',
  },
  {
    q: 'How much does it cost to book a Pandit on ReligioGram?',
    a: 'Pandit booking fees start from ₹500 for a Daily Ghar Puja and range up to ₹21,000 for a full wedding ceremony. Each ritual has a transparent price band set by the priest based on complexity, materials, and duration. There are no hidden platform fees — the price you see is what you pay.',
  },
  {
    q: 'Are the Pandits and astrologers on ReligioGram verified?',
    a: 'Yes. Every provider goes through KYC verification before appearing in search — government ID check, live selfie, video KYC, and credential review. Providers below our ongoing quality threshold are removed. Only KYC-approved providers can accept bookings or consultations.',
  },
  {
    q: 'How does astrology consultation billing work?',
    a: 'Astrology sessions are billed per minute. You top up your wallet via Razorpay, and the session charges the wallet in real time as it runs. Typical rates range from ₹10 to ₹100 per minute depending on the astrologer. Unused amounts stay in your wallet for future sessions.',
  },
  {
    q: 'Can I get a refund if a consultation goes wrong?',
    a: 'Yes. If a consultation is cut short due to a technical issue, provider no-show, or clearly poor quality, contact support at support@religiogram.com within 24 hours. Approved refunds are credited back to your wallet or original payment method.',
  },
  {
    q: 'Is my birth details data secure on ReligioGram?',
    a: 'Yes. Your full name, birth date, and birth time are stored encrypted using AES-256-GCM. Only you and the astrologer you consult with can see them. You can delete your birth profile any time from your account settings.',
  },
  {
    q: 'Which faiths does ReligioGram support?',
    a: 'ReligioGram supports Hindu, Muslim, Sikh, and Christian communities today. That means Pandits for pujas and havans, Imams for Nikah and Aqeeqa, Granthis for Anand Karaj and Akhand Path, and Priests for baptisms and Christian weddings. We add more traditions as our community grows.',
  },
  {
    q: 'How do I book a priest for a specific ritual like Satyanarayan Katha?',
    a: 'Open the app or website, tap Rituals & Services, pick your faith (Hindu), and choose Satyanarayan Katha from the ritual catalog. You\'ll see verified Pandits nearby with ratings, price bands, and availability. Tap Book to confirm the date and place — the priest confirms within 24 hours.',
  },
  {
    q: 'Can I invite a Pandit to my home for a puja?',
    a: 'Yes. Every Pandit on ReligioGram accepts home service bookings. Confirm your address during booking, and the Pandit arrives with all required puja materials (or brings a list you can shop in advance). Home service is included in the price for most rituals.',
  },
  {
    q: 'What is Kundli matching and can I get it done on ReligioGram?',
    a: 'Kundli matching is the traditional Vedic compatibility check between prospective marriage partners, comparing 36 gunas across both birth charts. Yes — book a Kundli Matching consultation with any verified Vedic astrologer on ReligioGram. Rates start at ₹500 for a basic report.',
  },
  {
    q: 'How do I find temples, mosques, gurudwaras, or churches near me?',
    a: 'Tap Holy Places from the bottom navigation. Grant location access and ReligioGram shows verified places of worship near you, organized by faith with reviews, opening hours, event calendars, and directions. Follow specific places to get event notifications.',
  },
  {
    q: 'Does ReligioGram work in cities outside major metros?',
    a: 'Yes. We serve all of India — from top 30 metros to Tier 2 and 3 cities. Provider availability varies by city. If no priest is available locally for a specific service, remote consultation and live-streamed pujas from partner temples are usually available.',
  },
  {
    q: 'Is ReligioGram free to download and use?',
    a: 'Yes. The app is free to download from Google Play. Browsing providers, viewing horoscopes, reading community posts, and discovering holy places are all free. You only pay when you book a consultation, invite a priest, or top up your wallet.',
  },
  {
    q: 'How do I delete my account and data?',
    a: 'Go to Profile → Delete Account, or visit religiogram.com/delete-account. Your account, chat history, birth profile, and wallet balance are permanently deleted. Anonymized transaction records may be retained for tax/audit compliance as required by Indian law.',
  },
  {
    q: 'How do I become a Pandit, Imam, Granthi, or astrologer on ReligioGram?',
    a: 'Open the app, go to Profile → Become a Service Provider. You\'ll walk through a 6-step onboarding: personal details, KYC (PAN + Aadhaar + live selfie), video verification, service catalog + pricing, availability, and bank details for payouts. Approved providers usually go live within 3–5 business days.',
  },
  {
    q: 'What payment methods does ReligioGram accept?',
    a: 'ReligioGram accepts UPI, credit/debit cards, net banking, and popular Indian wallets through Razorpay. All payments are PCI-compliant and encrypted. Wallet balances can be used for any service — bookings, consultations, or top-ups for future use.',
  },
  {
    q: 'Can I get a horoscope reading without booking a consultation?',
    a: 'Yes. Daily horoscopes for all 12 zodiac signs are free on the Astrology tab — no consultation needed. If you want a personalized reading based on your birth chart, that\'s a paid consultation with a verified astrologer starting from ₹10 per minute.',
  },
];

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/faq#faqpage`,
  url: `${SITE_URL}/faq`,
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.a,
    },
  })),
  isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}#website` },
};

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
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
          Frequently Asked Questions
        </h1>
        <p style={{ fontSize: 17, color: '#5A4A38', marginBottom: 40 }}>
          Answers to the most common questions about booking Pandits, astrologers,
          wallet payments, verification, and more.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {FAQS.map((f, i) => (
            <details
              key={i}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '16px 20px',
                border: '1.5px solid rgba(200,146,10,0.18)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 800,
                  color: NAVY,
                  fontFamily: '"Playfair Display", Georgia, serif',
                  letterSpacing: '-0.01em',
                  listStyle: 'none',
                }}
              >
                {f.q}
              </summary>
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 15,
                  color: '#4A3010',
                  lineHeight: 1.6,
                }}
              >
                {f.a}
              </p>
            </details>
          ))}
        </div>

        <div
          style={{
            marginTop: 60,
            padding: '20px 22px',
            background: 'linear-gradient(135deg,#FFF6E0,#FDEFC5)',
            borderRadius: 16,
            border: '1.5px solid rgba(200,146,10,0.35)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: NAVY }}>
            Still have questions?
          </p>
          <p style={{ margin: '6px 0 12px', fontSize: 13.5, color: '#5A4A38' }}>
            Reach us at{' '}
            <a
              href="mailto:support@religiogram.com"
              style={{ color: GOLD, fontWeight: 700, textDecoration: 'underline' }}
            >
              support@religiogram.com
            </a>{' '}
            — we typically respond within 24 hours.
          </p>
          <Link
            href="/about"
            style={{
              display: 'inline-block',
              background: NAVY,
              color: CREAM,
              fontWeight: 800,
              padding: '9px 22px',
              borderRadius: 100,
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            Learn more about ReligioGram
          </Link>
        </div>
      </main>
    </>
  );
}
