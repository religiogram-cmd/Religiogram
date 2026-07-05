'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReligion } from '@/lib/useReligion';
import ReligionPicker from '@/components/discovery/ReligionPicker';

const GOLD   = '#C8920A';
const GOLD2  = '#E8A020';
const NAVY   = '#0A1628';
const PARCH  = '#F5E6C0';
const PARCH2 = '#EDD89A';

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

/* ── Religion picker modal data ──────────────────────────────── */
const RELIGION_MODAL_OPTIONS = [
  { key: 'hindu',     label: 'Hindu',     emoji: '🕉️' },
  { key: 'muslim',    label: 'Muslim',    emoji: '☪️' },
  { key: 'sikh',      label: 'Sikh',      emoji: '🪯' },
  { key: 'christian', label: 'Christian', emoji: '✝️' },
];

/* ── Religion Picker Bottom Sheet ───────────────────────────── */
function ReligionPickerModal({ onSelect, onSkip }: { onSelect: (r: string) => void; onSkip: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,22,40,0.55)', backdropFilter: 'blur(3px)' }} onClick={onSkip} />
      {/* Sheet */}
      <div style={{ position: 'relative', background: PARCH, borderRadius: '22px 22px 0 0', padding: '24px 20px 36px', boxShadow: '0 -8px 40px rgba(10,22,40,0.25)' }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(10,22,40,0.2)', margin: '0 auto 20px' }} />
        {/* Title */}
        <p style={{ fontSize: 17, fontWeight: 800, color: NAVY, fontFamily: '"Playfair Display",Georgia,serif', textAlign: 'center', margin: '0 0 6px' }}>
          Choose your faith
        </p>
        <p style={{ fontSize: 12, color: 'rgba(10,22,40,0.55)', textAlign: 'center', margin: '0 0 20px', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
          For a personalised experience
        </p>
        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          {RELIGION_MODAL_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '16px 10px', borderRadius: 16, cursor: 'pointer',
                background: '#fff', border: `1.5px solid rgba(200,146,10,0.3)`,
                boxShadow: '0 2px 10px rgba(10,22,40,0.08)', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 28 }}>{opt.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{opt.label}</span>
            </button>
          ))}
        </div>
        {/* Skip link */}
        <button
          onClick={onSkip}
          style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(10,22,40,0.45)', fontFamily: '"Plus Jakarta Sans",sans-serif', padding: '6px 0', textAlign: 'center' }}
        >
          Skip / View All
        </button>
      </div>
    </div>
  );
}

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

/* faith symbol for landing cards */
function FaithSymbol({ faithKey }: { faithKey: string }) {
  const size = 60;
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
    border: '2.5px solid rgba(200,146,10,0.35)', flexShrink: 0,
  };
  const sym: React.CSSProperties = { color: GOLD, lineHeight: 1, userSelect: 'none' };
  if (faithKey === 'hindu')    return <div style={{ ...base, background: '#0A1628' }}><span style={{ ...sym, fontSize: 29, fontFamily: 'serif' }}>&#x950;</span></div>;
  if (faithKey === 'muslim')   return <div style={{ ...base, background: '#0C3320' }}><span style={{ ...sym, fontSize: 28 }}>&#x262a;</span></div>;
  if (faithKey === 'sikh')     return <div style={{ ...base, background: '#1A0C00' }}><span style={{ ...sym, fontSize: 27 }}>&#x262c;</span></div>;
  return                              <div style={{ ...base, background: '#2A1060' }}><span style={{ ...sym, fontSize: 28 }}>&#x271d;</span></div>;
}

const FAITH_CARDS = [
  { key: 'hindu',     label: 'Hindu',     image: '/priests/hindu-hero.jpg',     desc: 'Pujas, rituals, havans & ceremonies',        verified: 'Verified & Experienced Pandits' },
  { key: 'muslim',    label: 'Muslim',    image: '/priests/muslim-hero.jpg',    desc: 'Namaz services, dua, Nikah & other rituals', verified: 'Verified & Experienced Imams' },
  { key: 'sikh',      label: 'Sikh',      image: '/priests/sikh-hero.jpg',      desc: 'Gurbani, path, kirtan & Sikh ceremonies',    verified: 'Verified & Experienced Granthis' },
  { key: 'christian', label: 'Christian', image: '/priests/christian-hero.jpg', desc: 'Mass, prayers, sacraments & life events',     verified: 'Verified & Experienced Priests' },
];

/* ── Landing ──────────────────────────────────────────────────── */
function LandingPage({ onFaith }: { onFaith: (f: string) => void }) {
  return (
    <div style={{ minHeight: '100svh', background: PARCH, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 14, paddingLeft: 20, paddingRight: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(10,22,40,0.3)' }}>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif', letterSpacing: '0.01em', paddingTop: 14 }}>Priests</h1>
      </div>
      <div style={{ flex: 1, padding: '22px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, transparent, ${GOLD}70)` }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif', whiteSpace: 'nowrap' }}>Choose your faith to get started</p>
          <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, ${GOLD}70, transparent)` }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 100 }}>
          {FAITH_CARDS.map(fc => (
            <button key={fc.key} onClick={() => onFaith(fc.key)} style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', minHeight: 270, background: '#0A0A0A', boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${fc.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.65) 58%, rgba(0,0,0,0.92) 100%)' }} />
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative', padding: '0 12px 6px', textAlign: 'left' }}>
                <p style={{ color: GOLD2, fontSize: 20, fontWeight: 900, margin: '0 0 3px', fontFamily: '"Playfair Display",Georgia,serif', textShadow: '0 2px 6px rgba(0,0,0,0.9)', letterSpacing: '-0.01em' }}>{fc.label}</p>
                <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 10.5, margin: '0 0 3px', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.35 }}>{fc.desc}</p>
                <p style={{ color: GOLD2, fontSize: 10, fontWeight: 600, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>&#x2713; {fc.verified}</p>
              </div>
              <div style={{ position: 'relative', padding: '4px 12px 10px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ background: GOLD2, borderRadius: 100, padding: '6px 24px', display: 'inline-block', boxShadow: '0 2px 8px rgba(232,160,32,0.3)' }}>
                  <span style={{ color: NAVY, fontSize: 11, fontWeight: 800, fontFamily: '"Plus Jakarta Sans",sans-serif', letterSpacing: '0.02em' }}>Explore &#x2192;</span>
                </div>
              </div>
            </button>
          ))}
        </div>
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

      <div style={{ padding: '12px 12px 0' }}>
        {/* Hero card */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, minHeight: 295, marginBottom: 14 }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${faith.heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center top' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.18) 30%,rgba(0,0,0,0.85) 100%)' }} />
          <div style={{ position: 'relative', padding: '160px 16px 18px' }}>
            <h1 style={{ color: '#fff', fontSize: 25, fontWeight: 900, margin: '0 0 7px', fontFamily: '"Playfair Display",Georgia,serif', textShadow: '0 2px 12px rgba(0,0,0,0.7)', letterSpacing: '-0.02em' }}>{faith.heroTitle}</h1>
            <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, margin: '0 0 14px', fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.45, maxWidth: '78%' }}>{faith.heroDesc}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Book in minutes</span>
              <Link
                href={
                  faithKey === 'hindu'     ? '/priests/hindu/pujas'         :
                  faithKey === 'muslim'    ? '/priests/muslim/services'     :
                  faithKey === 'christian' ? '/priests/christian/services'  :
                  `/priests/invite?faith=${faithKey}`
                }
                style={{ background: GOLD2, borderRadius: 100, padding: '8px 22px', boxShadow: '0 2px 10px rgba(232,160,32,0.35)', textDecoration: 'none' }}
              >
                <span style={{ color: NAVY, fontSize: 12, fontWeight: 800, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Explore &#x2192;</span>
              </Link>
            </div>
          </div>
        </div>

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

  const handleFaithSelect = (f: string) => {
    router.push(`/priests?faith=${f}`);
  };

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
    return <FaithDetailPage faithKey={faithParam} onBack={() => router.push('/priests')} />;
  }

  /* 'all' or no matching faith → landing that lists all faiths. */
  return <LandingPage onFaith={handleFaithSelect} />;
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
