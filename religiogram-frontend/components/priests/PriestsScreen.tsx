'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReligion } from '@/lib/useReligion';
import ReligionPicker from '@/components/discovery/ReligionPicker';
import ProviderMarketplace, {
  type Faith as MarketplaceFaith,
  type ProviderRecord,
} from '@/components/priests/ProviderMarketplace';

const GOLD    = '#C8920A';
const GOLD2   = '#E8A020';
const GOLD_L  = '#E0A92F';
const NAVY    = '#0A1628';
const PARCH   = '#F5E6C0';
const CREAM   = '#FFF8E7';

/* ── Faith config ─────────────────────────────────────────────── */
const FAITHS: Record<string, {
  label: string; heroImage: string; heroTitle: string; heroSub: string; heroDesc: string;
  accentColor: string; chips: string[];
  categories: { id: string; title: string; subtitle: string; image: string; href: string; icon: string }[];
}> = {
  hindu: {
    label: 'Hindu', heroImage: '/priests/hindu-hero.jpg',
    heroTitle: 'Hindu Rituals & Services', heroSub: 'Connect with verified Pandits & Purohits',
    heroDesc: 'Puja, ceremonies & life events performed by verified priests at your home or venue',
    accentColor: '#FF7043',
    chips: ['Puja & Havans', 'Weddings', 'Naming Ceremonies', 'Funerals', 'Griha Shanti', 'Vastu Shanti'],
    categories: [
      { id: 'invite', title: 'Invite a Pandit / For Events', subtitle: 'Invite a Pandit for your events, ceremonies or religious programs', image: '/priests/hindu-invite.jpg', href: '/priests/invite?faith=hindu', icon: 'cal' },
      { id: 'ask',    title: 'Ask a Pandit', subtitle: 'Get answers to your religious questions from experienced and trusted Pandits', image: '/priests/hindu-ask.jpg', href: '/consult?faith=hindu', icon: 'chat' },
    ],
  },
  muslim: {
    label: 'Muslim', heroImage: '/priests/muslim-hero.jpg',
    heroTitle: 'Muslim Rituals & Services', heroSub: 'Connect with verified Imams',
    heroDesc: 'Nikah, Janaza & ceremonies performed by verified Imams at your home or venue',
    accentColor: '#2E7D52',
    chips: ['Nikah', 'Janaza', 'Aqeeqa', 'Quran Recitation', 'Islamic Counseling', 'Khatam'],
    categories: [
      { id: 'invite', title: 'Invite an Imam / For Events', subtitle: 'Invite an Imam for your events, ceremonies or religious programs', image: '/priests/muslim-invite.jpg', href: '/priests/invite?faith=muslim', icon: 'cal' },
      { id: 'ask',    title: 'Ask an Imam', subtitle: 'Get answers to your Islamic questions from experienced and trusted Imams', image: '/priests/muslim-ask.jpg', href: '/consult?faith=muslim', icon: 'chat' },
    ],
  },
  sikh: {
    label: 'Sikh', heroImage: '/priests/sikh-hero.jpg',
    heroTitle: 'Sikh Rituals & Services', heroSub: 'Connect with verified Granthis',
    heroDesc: 'Gurbani, Path & ceremonies performed by verified Granthis at your home or Gurudwara',
    accentColor: '#E65100',
    chips: ['Anand Karaj', 'Naam Karan', 'Antim Ardas', 'Akhand Path', 'Sukhmani Sahib'],
    categories: [
      { id: 'invite', title: 'Invite a Granthi / For Events', subtitle: 'Invite a Granthi for your events, ceremonies or religious programs', image: '/priests/sikh-invite.jpg', href: '/priests/invite?faith=sikh', icon: 'cal' },
      { id: 'ask',    title: 'Ask a Granthi', subtitle: 'Get Gurbani wisdom via chat or voice call', image: '/priests/sikh-ask.jpg', href: '/consult?faith=sikh', icon: 'chat' },
    ],
  },
  christian: {
    label: 'Christian', heroImage: '/priests/christian-hero.jpg',
    heroTitle: 'Christian Rituals & Services', heroSub: 'Connect with verified Priests & Pastors',
    heroDesc: 'Baptism, Mass & life ceremonies performed by verified Priests at your home or church',
    accentColor: '#5C6BC0',
    chips: ['Baptism', 'Wedding', 'Funeral', 'Prayer Service', 'Pastoral Counseling', 'Mass'],
    categories: [
      { id: 'invite', title: 'Invite a Priest / For Events', subtitle: 'Invite a Priest for your events, ceremonies or religious programs', image: '/priests/christian-invite.jpg', href: '/priests/invite?faith=christian', icon: 'cal' },
      { id: 'ask',    title: 'Ask a Priest', subtitle: 'Get answers to your spiritual questions from experienced and trusted Priests', image: '/priests/christian-ask.jpg', href: '/consult?faith=christian', icon: 'chat' },
    ],
  },
};

/* Religion picker bottom-sheet + faith-symbol badges were only ever used
 * by the old LandingPage. They now live nowhere else, so removed to
 * keep this file focused on the FaithDetailPage flow.                  */

/* CatIcon (calendar / music / chat SVGs) used to render category cards
 * inside FaithDetailPage. Those cards were replaced by the marketplace
 * layout + bottom-sheet action modal, so CatIcon is no longer needed. */

/* Landing removed — the 4 religion cards now live on /home (see
 * components/home/HomeScreen.tsx). Users reach a specific faith either
 * from Home (?faith=X deep-link) or from their stored religion preference. */

/* ── Pick-your-faith fallback ─────────────────────────────────────
 * If we somehow land on /priests with religion='all' and no ?faith=X,
 * we default to Hindu but also hint the user they can change it in
 * Profile → Settings. This is a rare edge-case, since Home now
 * always sets ?faith and the picker is compulsory on first visit. */
function PickYourFaithFallback() {
  return (
    <div style={{ minHeight: '100svh', background: PARCH, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 14, paddingLeft: 20, paddingRight: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(10,22,40,0.3)' }}>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif', letterSpacing: '0.01em', paddingTop: 14 }}>Priests</h1>
      </div>
      <div style={{ flex: 1, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: NAVY, margin: '0 0 10px', fontFamily: '"Playfair Display",Georgia,serif' }}>
          Pick your faith
        </p>
        <p style={{ fontSize: 13, color: 'rgba(10,22,40,0.65)', margin: '0 0 22px', lineHeight: 1.55, maxWidth: 320, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
          Choose a religion from Home, or set your preferred faith in Profile &rarr; Settings to personalise Priests.
        </p>
        <Link href="/home" style={{ background: GOLD2, borderRadius: 100, padding: '11px 28px', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ color: NAVY, fontSize: 13, fontWeight: 800, fontFamily: '"Plus Jakarta Sans",sans-serif', letterSpacing: '0.02em' }}>Go to Home</span>
        </Link>
      </div>
    </div>
  );
}

/* ── Faith detail ─────────────────────────────────────────────── */
/**
 * Faith-specific role label for the "Available <role>s" panel title inside
 * ProviderMarketplace, and for the action-modal copy. Matches the labels
 * used elsewhere across the priests flows (Pandit / Imam / Granthi / Priest).
 */
const ROLE_BY_FAITH: Record<string, string> = {
  hindu:     'Pandit',
  muslim:    'Imam',
  sikh:      'Granthi',
  christian: 'Priest',
};

function FaithDetailPage({ faithKey, onBack }: { faithKey: string; onBack: () => void }) {
  const faith = FAITHS[faithKey];
  const roleLabel = ROLE_BY_FAITH[faithKey] ?? 'Pandit';
  const router = useRouter();
  const isHindu = faithKey === 'hindu';

  /* Bottom-sheet state — set when a user taps a provider card. Modal shows
   * up to 3 action buttons (Invite, Ask via Chat, Voice/Video Call) whose
   * availability depends on the provider's consultationChannels. */
  const [actionModalProvider, setActionModalProvider] = useState<ProviderRecord | null>(null);

  /* Same localStorage key populated during profile / provider onboarding.
   * Passed into ProviderMarketplace for the Nearby filter. */
  const userCity = typeof window !== 'undefined'
    ? (window.localStorage.getItem('rg_user_city') ?? '').trim().toLowerCase()
    : '';

  /* Hindu users' primary experience is astrology, so bounce them to
   * /astrology/browse immediately on mount instead of landing on the
   * Pandits marketplace. Non-Hindu faiths render the priest panel below
   * with no astrology toggle — see `hideAstrologerToggle` on the
   * ProviderMarketplace prop below. */
  useEffect(() => {
    if (isHindu) router.replace('/astrology/browse');
  }, [isHindu, router]);

  if (!faith) return null;

  /* While the Hindu redirect is in flight we render nothing — avoids
   * a brief flash of the Pandits marketplace before the router kicks in. */
  if (isHindu) return null;

  return (
    <div style={{ minHeight: '100svh', background: CREAM, paddingBottom: 96 }}>
      {/* Header — preserved from the old FaithDetailPage: back button
       * (top-left), "Priests" title in gold, navy background. */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 14, paddingLeft: 20, paddingRight: 20, display: 'flex', alignItems: 'center', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
        <button onClick={onBack} style={{ position: 'absolute', left: 16, top: 'calc(env(safe-area-inset-top,0px) + 10px)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: '0 auto', fontFamily: '"Playfair Display",Georgia,serif', letterSpacing: '0.01em', paddingTop: 14 }}>Priests</h1>
      </div>

      {/* Marketplace layout — same component the invite flow's `select`
       * step uses. Differences here: Pandits tab is the default, tapping
       * a card opens the 3-button action sheet (Invite / Ask via Chat /
       * Voice-Video Call) instead of advancing a booking wizard, and the
       * Astrologers tab NAVIGATES to /astrology/browse (which has the
       * richer hero + search + topic chips + full filter sheet) instead
       * of showing the golden marketplace panel for astrologers. */}
      <div style={{ padding: '14px 14px 0' }}>
        <ProviderMarketplace
          faith={faithKey as MarketplaceFaith}
          userCity={userCity}
          onProviderTap={(p) => setActionModalProvider(p)}
          priestRoleLabel={roleLabel}
          /* Non-Hindu faiths: no astrology toggle at all. The header title
           * becomes "Available <RoleLabel>s" (Imams / Granthis / Priests)
           * and users see only the priest marketplace panel. */
          hideAstrologerToggle
        />
      </div>

      {/* Bottom-sheet action modal */}
      {actionModalProvider && (
        <ProviderActionSheet
          provider={actionModalProvider}
          faith={faithKey}
          roleLabel={roleLabel}
          onClose={() => setActionModalProvider(null)}
        />
      )}
    </div>
  );
}

/* ── Bottom-sheet action modal ──────────────────────────────────
 * Opens when a user taps a provider card on FaithDetailPage. Shows:
 *   1. Provider name + rating at the top
 *   2. Invite for Event  → /priests/invite?faith=<faith>&priestId=<id>
 *      (astrologer variant: ...&providerId=<id>&kind=astrologer)
 *   3. Ask via Chat      → /consult/<id>?mode=chat&channel=chat
 *   4. Voice Call        → /consult/<id>?mode=call&channel=voice  (if enabled)
 *   5. Video Call        → /consult/<id>?mode=call&channel=video  (if enabled)
 *
 * Voice + Video only render if the provider's channels array includes them.
 * Backdrop tap or ✕ button dismisses.
 */
function ProviderActionSheet({
  provider, faith, roleLabel, onClose,
}: {
  provider: ProviderRecord;
  faith: string;
  roleLabel: string;
  onClose: () => void;
}) {
  /* Astrologers are cross-faith — the invite flow needs `providerId` +
   * `kind=astrologer`. Priests still use the legacy `priestId` param.
   * We detect astrologer by absence of specialisations tied to religion —
   * but there's no clean signal on the record, so we fall back to the
   * marketplace's initial provider tab context. Simpler: providers who
   * lack a religion match still surface here; use a rough heuristic where
   * the card came from the astrologer tab by inspecting whether the
   * provider has any channel enabled AND no priest-only cue. As a safe
   * default we treat records surfaced via the Astrologers tab as
   * astrologer-kind. Since ProviderMarketplace doesn't currently forward
   * the tab, we default to 'priest' invite links here — the invite flow's
   * ceremony list still applies regardless. */
  const inviteHref = `/priests/invite?faith=${encodeURIComponent(faith)}&priestId=${encodeURIComponent(provider.id)}`;

  const hasChat  = provider.channels.includes('chat');
  const hasVoice = provider.channels.includes('voice');
  const hasVideo = provider.channels.includes('video');

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,22,40,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'rgsheetFade 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes rgsheetFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rgsheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: CREAM,
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.35)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          animation: 'rgsheetUp 0.22s ease-out',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 42, height: 4, borderRadius: 4,
          background: 'rgba(122,74,16,0.35)',
          margin: '10px auto 6px',
        }} />

        {/* Header: name + rating + close */}
        <div style={{ padding: '4px 18px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 18, fontWeight: 800, color: '#1A0800',
              lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {provider.name}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, marginTop: 4,
            }}>
              <span style={{
                color: '#5A2A00', fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ color: '#E0A020', fontSize: 14 }}>★</span>
                {provider.rating.toFixed(1)}
                {provider.reviews > 0 && (
                  <span style={{ color: '#8B6B35', fontWeight: 600, marginLeft: 2 }}>
                    ({provider.reviews})
                  </span>
                )}
              </span>
              {provider.isVerified && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: '#0F5132', fontWeight: 700, fontSize: 12,
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 15, height: 15, borderRadius: '50%',
                    background: '#16a34a', color: '#fff',
                    fontSize: 10, fontWeight: 900,
                  }}>✓</span>
                  Verified
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(10,22,40,0.06)',
              border: '1px solid rgba(10,22,40,0.15)',
              color: NAVY,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              minHeight: 36,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '4px 18px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Invite for Event */}
          <Link
            href={inviteHref}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 18px', borderRadius: 12,
              background: `linear-gradient(135deg, ${GOLD_L} 0%, ${GOLD} 100%)`,
              color: NAVY,
              fontWeight: 800, fontSize: 14,
              textDecoration: 'none',
              boxShadow: '0 6px 18px rgba(200,146,10,0.30)',
              minHeight: 48,
              fontFamily: '"Plus Jakarta Sans",sans-serif',
            }}
          >
            <span style={{ fontSize: 18 }}>📅</span>
            Invite for Event
          </Link>

          {/* Ask via Chat */}
          {hasChat ? (
            <Link
              href={`/consult/${encodeURIComponent(provider.id)}?mode=chat&channel=chat`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 18px', borderRadius: 12,
                background: NAVY,
                color: CREAM,
                fontWeight: 800, fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 6px 18px rgba(10,22,40,0.30)',
                minHeight: 48,
                fontFamily: '"Plus Jakarta Sans",sans-serif',
              }}
            >
              <span style={{ fontSize: 18 }}>💬</span>
              Ask via Chat
            </Link>
          ) : (
            <button
              type="button"
              disabled
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 18px', borderRadius: 12,
                background: '#EFE7D2',
                color: '#8B6B35',
                fontWeight: 700, fontSize: 13,
                border: 'none',
                cursor: 'not-allowed',
                minHeight: 48,
                fontFamily: '"Plus Jakarta Sans",sans-serif',
              }}
            >
              <span style={{ fontSize: 18, opacity: 0.5 }}>💬</span>
              Chat not available for this {roleLabel.toLowerCase()}
            </button>
          )}

          {/* Voice + Video — only when the provider has those channels */}
          {(hasVoice || hasVideo) && (
            <div style={{ display: 'flex', gap: 10 }}>
              {hasVoice && (
                <Link
                  href={`/consult/${encodeURIComponent(provider.id)}?mode=call&channel=voice`}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '14px 12px', borderRadius: 12,
                    background: '#fff',
                    color: NAVY,
                    border: `1.5px solid ${GOLD}`,
                    fontWeight: 800, fontSize: 13,
                    textDecoration: 'none',
                    minHeight: 48,
                    fontFamily: '"Plus Jakarta Sans",sans-serif',
                  }}
                >
                  <span style={{ fontSize: 16 }}>📞</span>
                  Voice Call
                </Link>
              )}
              {hasVideo && (
                <Link
                  href={`/consult/${encodeURIComponent(provider.id)}?mode=call&channel=video`}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '14px 12px', borderRadius: 12,
                    background: '#fff',
                    color: NAVY,
                    border: `1.5px solid ${GOLD}`,
                    fontWeight: 800, fontSize: 13,
                    textDecoration: 'none',
                    minHeight: 48,
                    fontFamily: '"Plus Jakarta Sans",sans-serif',
                  }}
                >
                  <span style={{ fontSize: 16 }}>🎥</span>
                  Video Call
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Provider tagline (specialisations, if any) */}
        {provider.specialisations.length > 0 && (
          <div style={{
            padding: '4px 18px 12px', fontSize: 11.5, color: '#8B6B35',
            textAlign: 'center', fontStyle: 'italic', lineHeight: 1.4,
          }}>
            {provider.specialisations.slice(0, 3).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inner ─────────────────────────────────────────────────────
 *
 * Priests section is gated by the shared `useReligion()` preference:
 *
 *   1. If we haven't loaded the preference yet → spinner
 *   2. If the user has never picked a religion → show the shared
 *      `ReligionPicker` (same one Holy Places uses). Compulsory — the
 *      picker's Continue button is disabled until a choice is made and
 *      the confirmation modal mentions Profile → Settings for changes.
 *   3. Once a religion IS set:
 *        - If ?faith=X is on the URL → show that faith's detail page
 *          (lets users switch faith temporarily via deep-links without
 *           overwriting their preference)
 *        - Otherwise → redirect to /priests?faith=<preferred>
 *
 * Because the preference is stored under a single shared key
 * (rg_user_religion) picking in either Priests OR Holy Places auto-applies
 * to the other. Changing later happens via Profile → Settings → My Faith.
 */
function PriestsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { religion, confirmReligion, loaded } = useReligion();

  const faithParam = params.get('faith');

  /* If the URL has no ?faith= but the user has a stored preference,
   * bounce to their preferred faith so the detail page renders directly. */
  useEffect(() => {
    if (loaded && religion && religion !== 'all' && !faithParam && FAITHS[religion]) {
      router.replace(`/priests?faith=${religion}`);
    }
  }, [loaded, religion, faithParam, router]);

  /* Loading state (first paint, before useReligion has resolved). */
  if (!loaded) {
    return (
      <div style={{ minHeight: '100svh', background: PARCH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid rgba(200,146,10,0.2)', borderTopColor: GOLD, borderRadius: '50%', animation: 'rgspin 0.7s linear infinite' }} />
        <style>{`@keyframes rgspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  /* Compulsory religion picker for first-time visitors. */
  if (religion === null) {
    return <ReligionPicker onConfirm={confirmReligion} />;
  }

  /* Deep-link to a specific faith takes priority over the stored preference. */
  if (faithParam && FAITHS[faithParam]) {
    return <FaithDetailPage faithKey={faithParam} onBack={() => router.push('/home')} />;
  }

  /* 'all' — landing no longer exists (moved to /home). Default to Hindu so
   * users don't hit a dead end; the fallback screen also directs them to
   * Home / Profile → Settings to change their preference. */
  if (religion === 'all') {
    return <FaithDetailPage faithKey="hindu" onBack={() => router.push('/home')} />;
  }

  /* Truly unknown state — no religion, no faith param, but 'loaded'. */
  return <PickYourFaithFallback />;
}

/* ── Export ──────────────────────────────────────────────────── */
export default function PriestsScreen() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100svh', background: PARCH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid rgba(200,146,10,0.2)', borderTopColor: GOLD, borderRadius: '50%' }} />
      </div>
    }>
      <PriestsInner />
    </Suspense>
  );
}
