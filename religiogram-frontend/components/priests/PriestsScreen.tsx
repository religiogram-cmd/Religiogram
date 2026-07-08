'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReligion } from '@/lib/useReligion';
import ReligionPicker from '@/components/discovery/ReligionPicker';

const GOLD   = '#C8920A';
const GOLD2  = '#E8A020';
const NAVY   = '#0A1628';
const PARCH  = '#F5E6C0';

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

/* category icon SVG */
function CatIcon({ type }: { type: string }) {
  if (type === 'cal') return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <rect x="7" y="14" width="2.5" height="2.5" rx="0.5" fill={GOLD2} stroke="none"/>
      <rect x="11" y="14" width="2.5" height="2.5" rx="0.5" fill={GOLD2} stroke="none"/>
      <rect x="15" y="14" width="2.5" height="2.5" rx="0.5" fill={GOLD2} stroke="none"/>
    </svg>
  );
  if (type === 'music') return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
  /* chat */
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

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
function FaithDetailPage({ faithKey, onBack }: { faithKey: string; onBack: () => void }) {
  const faith = FAITHS[faithKey];
  if (!faith) return null;

  return (
    <div style={{ minHeight: '100svh', background: NAVY, paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 14, paddingLeft: 20, paddingRight: 20, display: 'flex', alignItems: 'center', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
        <button onClick={onBack} style={{ position: 'absolute', left: 16, top: 'calc(env(safe-area-inset-top,0px) + 10px)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: '0 auto', fontFamily: '"Playfair Display",Georgia,serif', letterSpacing: '0.01em', paddingTop: 14 }}>Priests</h1>
      </div>

      <div style={{ padding: '18px 12px 0' }}>
        {/* The old "<Faith> Rituals & Services" hero card that used to sit
         * here has been moved to the Home page (see HomeScreen.tsx). This
         * page now goes straight to the action cards so users land where
         * they can immediately do something. */}

        {/* Category cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {faith.categories.map(cat => (
            <Link key={cat.id} href={cat.href} style={{ textDecoration: 'none' }}>
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, minHeight: 148, boxShadow: '0 6px 24px rgba(0,0,0,0.4)', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${cat.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(10,22,40,0.94) 0%,rgba(10,22,40,0.62) 58%,rgba(10,22,40,0.15) 100%)' }} />
                <div style={{ position: 'relative', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0, background: 'rgba(10,22,40,0.82)', border: `1.5px solid ${GOLD}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CatIcon type={cat.icon} />
                    </div>
                    <h3 style={{ color: GOLD2, fontSize: 16, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif', lineHeight: 1.25 }}>{cat.title}</h3>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, margin: '0 0 12px', fontFamily: '"Plus Jakarta Sans",sans-serif', maxWidth: '62%', lineHeight: 1.4 }}>{cat.subtitle}</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: GOLD2, borderRadius: 100, padding: '6px 18px', boxShadow: '0 2px 10px rgba(232,160,32,0.3)', display: 'inline-flex', alignItems: 'center' }}>
                      <span style={{ color: NAVY, fontSize: 11, fontWeight: 800, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Explore &#x2192;</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

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
