'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

/* =========================================================================
   ReligioGram — Terms, Privacy & Policies
   Verbatim from company Policy document. Effective 30 May 2026.
   ========================================================================= */

type Sub = { letter?: string; title: string; bullets?: string[]; intro?: string };
type Section = {
  num: number;
  id: string;
  title: string;
  intro?: string;
  groups?: { label?: string; bullets: string[] }[];
  subsections?: Sub[];
  note?: string;
};

const SECTIONS: Section[] = [
  {
    num: 1,
    id: 'terms',
    title: 'Terms of Service',
    subsections: [
      {
        title: '1. Acceptance of Terms',
        intro: 'By accessing or using Religiogram, users agree to these Terms.',
      },
      {
        title: '2. Platform Nature',
        intro: 'Religiogram is:',
        bullets: [
          'A technology platform',
          'A discovery and booking marketplace',
          'A social/community platform',
        ],
      },
      {
        title: 'Religiogram is NOT:',
        bullets: [
          'A religious authority',
          'A theological institution',
          'A guarantee of spiritual outcomes',
          'A political organization',
        ],
      },
      {
        title: '3. Eligibility',
        intro: 'Users must:',
        bullets: [
          'Be 18+',
          'Or use under guardian supervision',
          'Provide accurate information',
        ],
      },
      {
        title: '4. User Accounts',
        intro: 'Users are responsible for:',
        bullets: [
          'Password confidentiality',
          'Activities under their account',
          'Authentic information',
        ],
      },
      {
        title: 'RG may suspend:',
        bullets: ['Fake accounts', 'Abusive accounts', 'Fraudulent behavior'],
      },
      {
        title: '5. Prohibited Conduct',
        intro: 'Users cannot:',
        bullets: [
          'Promote hate speech',
          'Incite violence',
          'Defame religions',
          'Harass communities',
          'Share extremist propaganda',
          'Conduct scams',
          'Manipulate donations',
          'Share explicit content',
          'Impersonate clergy/providers',
          'Sell illegal products/services',
        ],
      },
      {
        title: '6. Religious Neutrality',
        intro: 'Religiogram does not endorse:',
        bullets: ['Any religion', 'Sect', 'Ideology', 'Political movement'],
      },
      {
        title: '7. Marketplace Disclaimer',
        intro: 'Providers are independent service providers.\nRG does not guarantee:',
        bullets: [
          'Ritual outcomes',
          'Spiritual results',
          'Astrology accuracy',
          'Healing claims',
        ],
      },
      {
        title: '8. Payments',
        intro: 'Platform may charge:',
        bullets: ['Convenience fees', 'Subscription fees', 'Commission fees'],
      },
      { title: 'Taxes may apply.' },
      {
        title: '9. Content Ownership',
        intro: 'Users retain ownership of uploaded content.\nUsers grant RG:',
        bullets: ['License to display', 'Host', 'Distribute', 'Moderate content'],
      },
      {
        title: '10. Termination',
        intro: 'RG may suspend/remove accounts violating policies.',
      },
      {
        title: '11. Limitation of Liability',
        intro: 'RG is not liable for:',
        bullets: [
          'Religious disagreements',
          'Spiritual outcomes',
          'Provider disputes',
          'Emotional distress from beliefs',
          'Third-party conduct',
        ],
      },
      {
        title: '12. Governing Law',
        intro:
          'Governed by laws of India.\nJurisdiction: Prayagraj/Allahabad courts or chosen incorporation jurisdiction.',
      },
    ],
  },
  {
    num: 2,
    id: 'privacy',
    title: 'Privacy Policy',
    intro: 'Mandatory under Indian DPDP framework.',
    subsections: [
      {
        title: 'Data Collected',
        bullets: [
          'Name',
          'Phone',
          'Email',
          'Device info',
          'Payment details',
          'Location',
          'Religious preferences voluntarily shared',
          'Booking history',
          'Messages',
        ],
      },
      {
        title: 'Sensitive Information',
        intro:
          'Religious belief data is highly sensitive.\nWe process religion-related preferences only with user consent.',
      },
      {
        title: 'Why Data Is Collected',
        bullets: [
          'Account creation',
          'Booking services',
          'Recommendations',
          'Fraud prevention',
          'Safety moderation',
          'Analytics',
        ],
      },
      {
        title: 'Third Parties',
        intro: 'Data may be shared with:',
        bullets: [
          'Payment gateways',
          'Verification vendors',
          'Cloud providers',
          'Law enforcement when legally required',
        ],
      },
      {
        title: 'User Rights',
        intro: 'Users may:',
        bullets: ['Access data', 'Correct data', 'Delete account', 'Withdraw consent'],
      },
      {
        title: 'Data Security',
        bullets: ['Encryption', 'Access control', 'Monitoring systems'],
      },
      {
        title: 'Data Retention',
        intro: 'Retain data only as legally/business necessary.',
      },
      {
        title: 'Contact',
        intro: 'Dedicated grievance officer email mandatory in India.',
      },
    ],
  },
  {
    num: 3,
    id: 'refund',
    title: 'Refund & Cancellation Policy',
    subsections: [
      {
        title: 'User Cancellation',
        bullets: [
          '100% refund before provider acceptance',
          'Partial refund after confirmation',
          'No refund after service starts',
        ],
      },
      {
        title: 'Provider Cancellation',
        bullets: ['Full refund', 'Optional compensation credits'],
      },
      {
        title: 'Digital Services',
        intro: 'No refunds once:',
        bullets: [
          'Consultation completed',
          'Ritual livestream started',
          'Astrology report delivered',
        ],
      },
      {
        title: 'Force Majeure',
        intro: 'Natural disasters, riots, technical outages excluded.',
      },
    ],
  },
  {
    num: 4,
    id: 'community',
    title: 'Community Guidelines',
    subsections: [
      {
        title: 'Ban:',
        bullets: [
          'Religious hate',
          'Extremism',
          'Radicalization',
          'Conversion coercion',
          'Sectarian abuse',
          'Fake miracle scams',
          'Violence glorification',
          'Political propaganda disguised as religion',
          'Manipulated religious misinformation',
        ],
      },
      {
        title: 'Allow:',
        bullets: [
          'Peaceful discussions',
          'Interfaith dialogue',
          'Educational debate',
          'Faith sharing',
          'Cultural celebration',
        ],
      },
      {
        title: 'Enforcement',
        bullets: [
          'Warning',
          'Temporary restriction',
          'Permanent ban',
          'Law enforcement escalation',
        ],
      },
    ],
  },
  {
    num: 5,
    id: 'providers',
    title: 'Provider Terms',
    intro: 'For priests, pastors, astrologers, temples, churches etc.',
    subsections: [
      {
        title: 'Requirements',
        intro: 'Providers must:',
        bullets: [
          'Submit valid identity proof',
          'Submit qualification/tradition proof where applicable',
          'Maintain respectful conduct',
          'Deliver booked services professionally',
        ],
      },
      {
        title: 'Prohibited',
        intro: 'Providers cannot:',
        bullets: [
          'Guarantee miracles',
          'Claim supernatural cures',
          'Promote medical misinformation',
          'Demand off-platform payments',
          'Harass users',
        ],
      },
      { title: 'Commission', intro: 'Define platform fee structure.' },
      {
        title: 'Ratings',
        intro: 'RG may:',
        bullets: [
          'Display reviews',
          'Suspend low-quality providers',
          'Remove fraudulent providers',
        ],
      },
    ],
  },
  {
    num: 6,
    id: 'moderation',
    title: 'Content Moderation Policy',
    subsections: [
      {
        title: 'Moderated Content',
        bullets: [
          'Posts',
          'Comments',
          'Videos',
          'Livestreams',
          'Messages',
          'Provider profiles',
        ],
      },
      {
        title: 'Detection Methods',
        bullets: ['AI moderation', 'User reports', 'Human review'],
      },
      {
        title: 'Removal Grounds',
        bullets: [
          'Hate speech',
          'Nudity',
          'Extremism',
          'Violence',
          'Fraud',
          'Spam',
          'Harassment',
        ],
      },
    ],
  },
  {
    num: 7,
    id: 'safety',
    title: 'Safety & Verification Policy',
    subsections: [
      {
        title: 'Verification',
        bullets: [
          'Phone verification',
          'Government ID verification for providers',
          'Background checks where possible',
        ],
      },
      {
        title: 'User Safety',
        intro: 'Users should:',
        bullets: [
          'Avoid cash payments',
          'Use in-app communication',
          'Report suspicious conduct',
        ],
      },
    ],
  },
  {
    num: 8,
    id: 'payments',
    title: 'Payments Policy',
    intro: 'Mention:',
    groups: [
      {
        bullets: [
          'Supported payment methods',
          'Refund timelines',
          'Tax invoices',
          'Settlement cycle',
          'Fraud checks',
        ],
      },
    ],
  },
  {
    num: 9,
    id: 'ip',
    title: 'Intellectual Property Policy',
    groups: [
      { bullets: ['Logo', 'Branding', 'UI', 'Content', 'App assets'] },
      {
        label: 'Users cannot:',
        bullets: ['Reproduce platform assets', 'Use RG branding without permission'],
      },
    ],
  },
  {
    num: 10,
    id: 'dmca',
    title: 'Copyright / DMCA Policy',
    intro: 'Allow reporting for:',
    groups: [
      {
        bullets: [
          'Unauthorized videos',
          'Religious media piracy',
          'Stolen sermons/content',
        ],
      },
    ],
    note: 'Include takedown process.',
  },
  {
    num: 11,
    id: 'retention',
    title: 'Data Retention & Deletion Policy',
    groups: [
      {
        bullets: ['Retention duration', 'Backup policy', 'Account deletion process'],
      },
    ],
  },
  {
    num: 12,
    id: 'cookie',
    title: 'Cookie Policy',
    groups: [
      { bullets: ['Analytics', 'Ads', 'Session data', 'Personalization'] },
    ],
  },
  {
    num: 13,
    id: 'child',
    title: 'Child Safety Policy',
    groups: [
      {
        bullets: [
          'No exploitation',
          'No grooming',
          'No harmful religious indoctrination targeting minors',
          'Immediate reporting/escalation',
        ],
      },
    ],
  },
  {
    num: 14,
    id: 'marketplace',
    title: 'Marketplace Disclaimer',
    intro: 'Providers are independent entities.\nRG is not responsible for:',
    groups: [
      {
        bullets: [
          'Spiritual advice accuracy',
          'Ritual outcomes',
          'Personal beliefs',
          'Religious interpretation conflicts',
        ],
      },
    ],
  },
  {
    num: 15,
    id: 'neutrality',
    title: 'Religious Neutrality Policy',
    intro: 'RG:',
    groups: [
      {
        bullets: [
          'Supports peaceful coexistence',
          'Does not promote superiority of any faith',
          'Does not permit hate or coercion',
          'Encourages respectful engagement',
        ],
      },
    ],
    subsections: [
      {
        letter: 'A',
        title: 'No Medical Claims',
        intro: 'Ban:',
        bullets: [
          '“Prayer cures cancer”',
          '“Guaranteed healing”',
          'Dangerous pseudo-medical claims',
        ],
      },
      {
        letter: 'B',
        title: 'No Financial Scam Claims',
        intro: 'Ban:',
        bullets: [
          'Miracle investment schemes',
          'Paid blessings for guaranteed wealth',
        ],
      },
      {
        letter: 'C',
        title: 'Anti-Extremism',
        intro: 'Zero tolerance for:',
        bullets: ['Terror propaganda', 'Radical recruitment', 'Violent ideology'],
      },
      {
        letter: 'D',
        title: 'No Political Mobilization',
        bullets: ['Election propaganda', 'Religious political manipulation'],
      },
      {
        letter: 'E',
        title: 'No Religious Conversion',
        intro: "RG don't support and motivate any religious conversion.",
      },
    ],
  },
];

/* ----- presentation ----- */

const NAVY = '#0F2452';
const NAVY_DEEP = '#08163A';
const GOLD = '#C8932A';
const CREAM = '#FAF6EC';
const INK = '#1F2937';
const MUTED = '#6B7280';
const RULE = '#E7E2D2';

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '6px 0 14px', paddingLeft: 22, color: INK, fontSize: 15, lineHeight: 1.7 }}>
      {items.map((b, i) => (
        <li key={i} style={{ marginBottom: 4 }}>{b}</li>
      ))}
    </ul>
  );
}

function Intro({ text }: { text: string }) {
  return (
    <p style={{ margin: '0 0 8px', color: INK, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
      {text}
    </p>
  );
}

function SubBlock({ s }: { s: Sub }) {
  const heading = s.letter ? `${s.letter}. ${s.title}` : s.title;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '14px 0 6px', fontSize: 15, fontWeight: 700, color: NAVY }}>
        {heading}
      </h3>
      {s.intro && <Intro text={s.intro} />}
      {s.bullets && <Bullets items={s.bullets} />}
    </div>
  );
}

function SectionCard({ s, open, onToggle }: { s: Section; open: boolean; onToggle: () => void }) {
  return (
    <section
      id={s.id}
      style={{
        background: '#fff',
        border: `1px solid ${RULE}`,
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden',
        scrollMarginTop: 92,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          background: open ? CREAM : '#fff',
          border: 0,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 120ms',
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: NAVY,
            color: GOLD,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            flex: '0 0 30px',
          }}
        >
          {s.num}
        </span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: NAVY }}>{s.title}</span>
        <span style={{ color: GOLD, fontSize: 18, lineHeight: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ padding: '14px 18px 18px', borderTop: `1px solid ${RULE}` }}>
          {s.intro && <Intro text={s.intro} />}
          {s.groups?.map((g, i) => (
            <div key={i}>
              {g.label && (
                <p style={{ margin: '8px 0 2px', color: INK, fontSize: 15, fontWeight: 600 }}>{g.label}</p>
              )}
              <Bullets items={g.bullets} />
            </div>
          ))}
          {s.subsections?.map((sub, i) => <SubBlock key={i} s={sub} />)}
          {s.note && (
            <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 13, fontStyle: 'italic' }}>{s.note}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function PolicyScreen({ defaultFocus = 'terms' }: { defaultFocus?: string }) {
  const router = useRouter();
  const initialOpen = useMemo(() => {
    // Open the focused section + Privacy by default; keep others collapsed
    const set = new Set<string>();
    set.add(defaultFocus);
    return set;
  }, [defaultFocus]);
  const [openIds, setOpenIds] = useState<Set<string>>(initialOpen);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setOpenIds(new Set(SECTIONS.map((s) => s.id)));
  const collapseAll = () => setOpenIds(new Set());

  const jump = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F6F4EE' }}>
      {/* Header */}
      <header
        style={{
          background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
          color: '#fff',
          padding: '20px 18px 22px',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          boxShadow: '0 2px 18px rgba(8,22,58,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.10)',
              border: `1px solid ${GOLD}`,
              color: GOLD,
              fontSize: 18,
              cursor: 'pointer',
              flex: '0 0 36px',
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>
              Terms & Policies
            </h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: 780, margin: '0 auto', padding: '18px 14px 60px' }}>
        {/* Quick nav */}
        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 14,
            paddingBottom: 12,
            borderBottom: `1px dashed ${RULE}`,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              style={{
                background: '#fff',
                border: `1px solid ${RULE}`,
                color: NAVY,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {s.num}. {s.title}
            </button>
          ))}
        </nav>

        {/* Expand/collapse */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
          <button
            onClick={expandAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: GOLD,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.3,
            }}
          >
            EXPAND ALL
          </button>
          <span style={{ color: RULE }}>|</span>
          <button
            onClick={collapseAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: NAVY,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 0.3,
            }}
          >
            COLLAPSE ALL
          </button>
        </div>

        {/* Sections */}
        {SECTIONS.map((s) => (
          <SectionCard
            key={s.id}
            s={s}
            open={openIds.has(s.id)}
            onToggle={() => toggle(s.id)}
          />
        ))}

      </main>
    </div>
  );
}
