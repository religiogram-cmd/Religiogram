/**
 * /delete-account — public page describing how a ReligioGram user can
 * delete their account and what data is retained or removed.
 *
 * Required by the Google Play "Data safety" form. The URL of this page
 * (`https://religiogramm.vercel.app/delete-account`) is provided to Play
 * Console so a reviewer (or any user) can find clear instructions for
 * exercising their data-erasure rights.
 */

export const metadata = {
  title: 'Delete Account — ReligioGram',
  description:
    'How to delete your ReligioGram account and what data is removed or retained.',
};

const NAVY = '#0F2452';
const GOLD = '#C8920A';
const CREAM = '#FFFAEC';
const TEXT = '#1A0800';
const TEXT2 = '#4A3010';

export default function DeleteAccountPage() {
  return (
    <div
      style={{
        minHeight: '100svh',
        background: CREAM,
        padding: '48px 20px',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        color: TEXT,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            color: NAVY,
            fontSize: 32,
            fontWeight: 800,
            margin: '0 0 8px',
          }}
        >
          Delete Your ReligioGram Account
        </h1>
        <p style={{ color: TEXT2, fontSize: 15, margin: '0 0 32px' }}>
          You can permanently delete your ReligioGram account and associated
          data at any time. Choose the option that suits you best below.
        </p>

        <Section title="Option 1 — From the app">
          <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Open the ReligioGram app and sign in.</li>
            <li>
              Tap <b>Profile</b> (bottom navigation, right-most icon).
            </li>
            <li>
              Tap <b>Settings → Delete Account</b>.
            </li>
            <li>Confirm. Your account is deleted within 24 hours.</li>
          </ol>
        </Section>

        <Section title="Option 2 — Email request">
          <p style={{ margin: '0 0 12px' }}>
            Email{' '}
            <a
              href="mailto:support@religiogram.in?subject=Account%20Deletion%20Request"
              style={{ color: GOLD, fontWeight: 700 }}
            >
              support@religiogram.in
            </a>{' '}
            from the same address you use to sign in. Subject:{' '}
            <i>Account Deletion Request</i>.
          </p>
          <p style={{ margin: 0 }}>
            We verify the request and complete the deletion within 7 business
            days.
          </p>
        </Section>

        <Section title="What gets deleted">
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Your profile (name, photo, email, phone, city)</li>
            <li>Your community posts, comments, likes, and direct messages</li>
            <li>Your follow/follower relationships</li>
            <li>Your bookings, ratings, and reviews</li>
            <li>Your wallet balance (after refunding any positive balance)</li>
            <li>
              Your KYC documents, photos, and videos (priests only) — purged
              from secure object storage
            </li>
            <li>Your birth profile, kundli, and saved AI conversations</li>
            <li>Device tokens used for push notifications</li>
          </ul>
        </Section>

        <Section title="What we must retain (and why)">
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              <b>Payment & invoice records</b> — retained for up to 7 years
              under Indian tax and KYC regulations (RBI / GST). Personally
              identifying fields are anonymised.
            </li>
            <li>
              <b>Trust &amp; safety logs</b> — abuse reports, fraud flags, and
              moderation actions kept for up to 12 months for platform safety.
            </li>
            <li>
              <b>Aggregated analytics</b> — non-identifiable usage metrics may
              be retained indefinitely.
            </li>
          </ul>
        </Section>

        <Section title="Need partial deletion only?">
          <p style={{ margin: 0 }}>
            You can request the deletion of specific data (e.g. a single post,
            your KYC video, or your birth profile) without closing your account.
            Email{' '}
            <a
              href="mailto:support@religiogram.in?subject=Partial%20Data%20Deletion"
              style={{ color: GOLD, fontWeight: 700 }}
            >
              support@religiogram.in
            </a>{' '}
            with the subject <i>Partial Data Deletion</i> and describe what you
            want removed.
          </p>
        </Section>

        <p style={{ marginTop: 40, fontSize: 13, color: TEXT2 }}>
          Last updated: June 2026 • Operator: ReligioGram • Contact:{' '}
          support@religiogram.in
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid rgba(200,146,10,0.18)',
        padding: '20px 24px',
        margin: '0 0 18px',
        boxShadow: '0 2px 12px rgba(15,36,82,0.06)',
      }}
    >
      <h2
        style={{
          color: NAVY,
          fontSize: 18,
          fontWeight: 800,
          margin: '0 0 12px',
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 14.5, color: TEXT, lineHeight: 1.6 }}>
        {children}
      </div>
    </section>
  );
}
