'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import WalletBadge from '@/components/wallet/WalletBadge';
import BirthDetailsModal from './BirthDetailsModal';
import { birthProfile } from '@/lib/astrology-api';
import { walletApi } from '@/lib/wallet-api';

const AstrologersTab = dynamic(() => import('./AstrologersTab'), { ssr: false });
const HoroscopeTab   = dynamic(() => import('./HoroscopeTab'),  { ssr: false });
const KundliTab      = dynamic(() => import('./KundliTab'),      { ssr: false });

const NAVY = '#0F2452';
const NAVY_MID = '#0F2452';
const GOLD = '#C8932A';

type Tab = 'astrologers' | 'horoscope' | 'kundli' | 'ai';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'astrologers', label: 'Astrologers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><circle cx="11" cy="11" r="3"/>
        <line x1="11" y1="3" x2="11" y2="1"/><line x1="11" y1="21" x2="11" y2="23"/>
        <line x1="3" y1="11" x2="1" y2="11"/><line x1="21" y1="11" x2="23" y2="11"/>
      </svg>
    ),
  },
  {
    id: 'horoscope', label: 'Horoscope',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/>
        <line x1="4.93" y1="19.07" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.07" y2="4.93"/>
      </svg>
    ),
  },
  {
    id: 'kundli', label: 'Kundli',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
        <line x1="3" y1="3" x2="21" y2="21"/>
      </svg>
    ),
  },
  // "AI Chat" tab removed per user request. Dedicated /rg-ai route hosts
  // the assistant now.
];

/** Balance below which we show the "Recharge to consult" prompt.
 *  ₹50 = 5000 paise. Anything higher is enough for at least a couple minutes
 *  even on the priciest providers, so the nudge would be annoying. */
const LOW_BALANCE_PAISE = 5_000;

interface AstrologyScreenProps {
  /**
   * When true, hides the top "Astrology ✦" title + "ReligioGram" eyebrow
   * so the screen can be embedded inside another shell that already
   * provides its own title (e.g. the Priests screen mounts this under
   * an Astrologers/Pandits toggle for Hindu users). The WalletBadge and
   * the sub-tab bar (Astrologers / Horoscope / Kundli) still render so
   * the full astrology experience is preserved.
   */
  embedded?: boolean;
}

export default function AstrologyScreen({ embedded = false }: AstrologyScreenProps = {}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('astrologers');

  /* First-visit birth-details capture + wallet-recharge nudge state.
   * Both live at this level because they mount BETWEEN the sticky header
   * and the tab content and need to coordinate: the wallet prompt only
   * appears after the modal is dismissed so we never stack two overlays. */
  const [showBirthModal, setShowBirthModal] = useState(false);
  const [birthChecked, setBirthChecked] = useState(false);
  /* Whether the current user has a saved birth profile on the backend.
   * Bookkept so a subsequent modal open (e.g. user navigates back into
   * the astrology tab after saving elsewhere, or after `onSaved` fires)
   * doesn't re-gate them. `null` = still checking; `false` = confirmed
   * missing; `true` = confirmed present. */
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletPromptDismissed, setWalletPromptDismissed] = useState(false);

  // Load "did the user dismiss the wallet nudge this session?" from
  // sessionStorage on mount so a page reload within the session honours it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.sessionStorage.getItem('rg_astro_wallet_prompt_dismissed') === '1') {
        setWalletPromptDismissed(true);
      }
    } catch { /* SSR / private mode — ignore */ }
  }, []);

  // Check for a saved birth profile on first paint. Missing profile + no
  // prior "skip" → show the modal. Errors fall through silently so a
  // transient network failure never blocks the marketplace.
  //
  // "Skip" is stored in sessionStorage rather than localStorage so a user
  // who dismisses the prompt today gets asked again in a fresh browser
  // session. Also honour the legacy localStorage flag one last time so
  // existing dismissals aren't rudely reversed within the same visit —
  // clear it so from the next session onward we use sessionStorage only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = typeof window !== 'undefined' ? window : null;
        const legacySkipped = w?.localStorage.getItem('rg_astro_birth_skipped') === '1';
        const sessionSkipped = w?.sessionStorage.getItem('rg_astro_birth_skipped') === '1';
        if (w && legacySkipped) {
          // Migrate the sticky localStorage flag into a one-session
          // sessionStorage flag so next fresh session prompts again.
          try {
            w.localStorage.removeItem('rg_astro_birth_skipped');
            w.sessionStorage.setItem('rg_astro_birth_skipped', '1');
          } catch { /* private mode — ignore */ }
        }
        const skipped = legacySkipped || sessionSkipped;
        const p = await birthProfile.get();
        if (cancelled) return;
        const found = !!(p && p.fullName && p.birthDate && p.birthCity);
        setHasProfile(found);
        if (!found && !skipped) setShowBirthModal(true);
      } catch {
        // Non-fatal — never block the screen. Leave hasProfile as null so
        // a retry can still populate it later without spuriously gating.
      }
      finally { if (!cancelled) setBirthChecked(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cross-component signal from BirthDetailsModal (and anywhere else that
  // might edit the profile in the future). When we receive it we flip
  // hasProfile to true so a subsequent re-mount doesn't re-open the modal
  // while the network state has already been updated by the save call.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUpdated = () => setHasProfile(true);
    window.addEventListener('birth:profile:updated', onUpdated);
    return () => window.removeEventListener('birth:profile:updated', onUpdated);
  }, []);

  // Fetch wallet balance for the recharge nudge. WalletBadge fetches its own
  // copy for display; this second fetch drives the prompt gate so we know
  // whether to render the card. Cheap enough to duplicate at first paint.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const b = await walletApi.balance();
        if (cancelled) return;
        setWalletBalance((b.availablePaise ?? 0) + (b.promoCreditsPaise ?? 0));
      } catch { /* non-fatal — prompt stays hidden */ }
    };
    void load();
    const onRefresh = () => void load();
    if (typeof window !== 'undefined') {
      window.addEventListener('wallet:refresh', onRefresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('wallet:refresh', onRefresh);
      }
    };
  }, []);

  const dismissWalletPrompt = () => {
    setWalletPromptDismissed(true);
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.setItem('rg_astro_wallet_prompt_dismissed', '1'); } catch { /* ignore */ }
    }
  };

  const showWalletPrompt =
    birthChecked
    && !showBirthModal
    && !walletPromptDismissed
    && walletBalance !== null
    && walletBalance < LOW_BALANCE_PAISE;

  function handleTabClick(id: Tab) {
    if (id === 'ai') {
      const btn = document.getElementById('astro-ai-trigger') as HTMLButtonElement | null;
      if (btn) btn.click();
      return;
    }
    setActiveTab(id);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100svh',
      background: '#F6F7FA',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: '#fff',
        borderBottom: '1px solid rgba(15,36,82,0.08)',
        flexShrink: 0,
      }}>
        {/* Top bar — hidden when embedded because the outer host (e.g.
            Priests > Astrologers tab for Hindu) already renders its own
            title bar. Wallet badge floats on the right of the tab row
            instead. */}
        {!embedded && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px 12px',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#94A3B8' }}>
                ReligioGram
              </p>
              <h1 style={{
                margin: '2px 0 0',
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 22, fontWeight: 700, color: NAVY,
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                Astrology{' '}
                <span style={{
                  background: `linear-gradient(135deg, #D4A335 0%, ${GOLD} 50%, #9A6F15 100%)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>✦</span>
              </h1>
            </div>
            {/* Right side — wallet badge lets users see their balance and
                tap through to /wallet without leaving the astrology home. */}
            <WalletBadge />
          </div>
        )}
        {embedded && (
          /* Compact header row when embedded — takes the place of the
             omitted top bar. Left side gets a small tagline so the row
             doesn't feel empty next to the wallet badge on the right. */
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '10px 20px 4px',
          }}>
            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 15, fontWeight: 800, color: NAVY,
                fontFamily: '"Playfair Display", Georgia, serif',
                letterSpacing: '-0.01em', lineHeight: 1.15,
              }}>
                Talk to Astrologers
                <span style={{
                  marginLeft: 6,
                  background: `linear-gradient(135deg, #D4A335 0%, ${GOLD} 50%, #9A6F15 100%)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  fontSize: 14,
                }}>✦</span>
              </p>
              <p style={{
                margin: '2px 0 0', fontSize: 11, fontWeight: 600, color: '#7A6650',
                lineHeight: 1.2,
              }}>
                Chat &amp; call with verified experts
              </p>
            </div>
            <WalletBadge />
          </div>
        )}

        {/* Tab bar — hidden when embedded because the host screen (Priests
            > Astrologers) only wants the astrologer catalog, not the
            Horoscope/Kundli sub-tabs. Standalone /astrology still shows
            the full sub-tab strip. */}
        {!embedded && (
          <div style={{ display: 'flex', padding: '0 20px', gap: 0 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id && tab.id !== 'ai';
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 3, paddingBlock: 9, paddingInline: 4,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    borderBottom: isActive ? `2.5px solid ${GOLD}` : '2.5px solid transparent',
                    transition: 'all 0.15s',
                    color: isActive ? NAVY : tab.id === 'ai' ? '#7C3AED' : '#94A3B8',
                  }}
                >
                  <span style={{ opacity: isActive ? 1 : tab.id === 'ai' ? 0.85 : 0.6 }}>{tab.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: isActive ? 700 : 500,
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                    letterSpacing: '-0.01em',
                  }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Wallet-recharge nudge ──
          Sits between the sticky header and the tab content so it's the
          first thing users see when their balance is too low to actually
          buy a session. Session-scoped dismissal via sessionStorage. */}
      {showWalletPrompt && (
        <div style={{
          margin: '10px 14px 4px',
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #FFFAEC, #FDF3D5)',
          border: `1px solid ${GOLD}55`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 10px rgba(200,147,42,0.12)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${GOLD}, #9A6F15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, fontWeight: 800, flexShrink: 0,
          }}>
            ₹
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: NAVY, lineHeight: 1.25 }}>
              Add money to start consulting
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#4A3010', lineHeight: 1.35 }}>
              Your wallet has ₹{Math.round((walletBalance ?? 0) / 100)}. Recharge to unlock chat &amp; call with astrologers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/wallet')}
            style={{
              flexShrink: 0,
              padding: '8px 14px', borderRadius: 999,
              background: `linear-gradient(135deg, ${GOLD}, #9A6F15)`,
              border: 'none', color: '#fff',
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >Add Money</button>
          <button
            type="button"
            onClick={dismissWalletPrompt}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              width: 24, height: 24, borderRadius: 999,
              background: 'transparent', border: 'none',
              color: '#94a3b8', fontSize: 18, cursor: 'pointer',
              lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'astrologers' && <AstrologersTab />}
        {activeTab === 'horoscope'   && <HoroscopeTab />}
        {activeTab === 'kundli'      && <KundliTab />}
      </div>

      {/* First-visit birth-details capture. Renders nothing when open=false.
          Uses localStorage to remember "Skip" across sessions so we don't
          nag on every visit. */}
      <BirthDetailsModal
        // hasProfile short-circuit: even if `showBirthModal` is somehow true
        // (e.g. dev tools flipped it, or a future path that opens the modal
        // programmatically), a confirmed-present profile suppresses the
        // gate. Belt-and-braces alongside the bootstrap effect.
        open={showBirthModal && hasProfile !== true}
        onClose={() => setShowBirthModal(false)}
        onSaved={() => {
          // Modal has persisted the profile server-side — flip local state
          // so a re-render (or a future re-mount within the same tab) won't
          // re-open the gate.
          setHasProfile(true);
        }}
      />
    </div>
  );
}
