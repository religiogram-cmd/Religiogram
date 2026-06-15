'use client';

import { useEffect, useState } from 'react';
import { community, CommunityProfile } from '@/lib/community-api';
import { tokenStore } from '@/lib/api';
import CommunitySetupScreen from './CommunitySetupScreen';
import CommunityFeedTab from './CommunityFeedTab';
import CommunityDiscoverTab from './CommunityDiscoverTab';
import CommunityMessagesTab from './CommunityMessagesTab';
import CommunityNotificationsTab from './CommunityNotificationsTab';
import CommunityProfileTab from './CommunityProfileTab';
import PostComposerModal from './PostComposerModal';

const NAVY    = '#0A1628';
const NAVY_2  = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFFAEC';
const TEXT3   = '#8B6B35';

type Tab = 'feed' | 'discover' | 'messages' | 'notifications' | 'profile';

export default function CommunityScreen() {
  const [phase, setPhase] = useState<'loading' | 'setup' | 'ready'>('loading');
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [composer, setComposer] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedKey, setFeedKey] = useState(0);   // bumped to force feed refresh after a new post

  /* ── bootstrap profile ───────────────────────────── */
  useEffect(() => {
    if (!tokenStore.access) { setPhase('setup'); return; }
    let cancelled = false;
    community.me.get()
      .then(p => {
        if (cancelled) return;
        if (!p || !p.username) { setPhase('setup'); return; }
        setProfile(p);
        setPhase('ready');
      })
      .catch(() => { if (!cancelled) setPhase('setup'); });
    return () => { cancelled = true; };
  }, []);

  /* ── unread poll ─────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'ready') return;
    const tick = () => {
      community.notifications.unreadCount()
        .then(r => setUnreadCount(r?.count ?? 0))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '100svh', background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 22, height: 22, border: '2.5px solid rgba(200,146,10,0.25)', borderTopColor: GOLD, borderRadius: '50%', animation: 'cspin 0.8s linear infinite' }} />
        <style>{`@keyframes cspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (phase === 'setup' || !profile) {
    return <CommunitySetupScreen onComplete={(p) => { setProfile(p); setPhase('ready'); }} />;
  }

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 24 }}>

      {/* ── HERO ────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        background: `linear-gradient(150deg, ${NAVY} 0%, ${NAVY_2} 55%, #1B2540 100%)`,
        padding: '20px 18px 0',
        overflow: 'hidden',
      }}>
        {/* faint mandala in corner */}
        <div aria-hidden style={{
          position: 'absolute', top: -30, left: -30, width: 160, height: 160,
          background: 'radial-gradient(circle, rgba(232,169,47,0.15) 0%, rgba(232,169,47,0) 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 32, fontWeight: 800, color: '#FFFAEC',
              margin: 0, lineHeight: 1, letterSpacing: '-0.01em',
            }}>Community</h1>
            <div style={{ marginTop: 6, color: GOLD_L, fontSize: 12.5, letterSpacing: '0.04em', fontWeight: 600 }}>
              Connect · Share · Inspire
            </div>
          </div>

          {/* Create Post — gold-ringed circle button */}
          <button
            onClick={() => setComposer(true)}
            aria-label="Create post"
            style={{
              position: 'relative',
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(15, 36, 82, 0.35)',
              border: `2px solid ${GOLD_L}`,
              boxShadow: `0 0 18px rgba(232,169,47,0.45), inset 0 0 0 1px rgba(255,250,236,0.15)`,
              cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: GOLD_L, fontSize: 30, fontWeight: 300, lineHeight: 1,
            }}
          ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        </div>

        {/* TAB BAR */}
        <div style={{
          marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          borderTop: '1px solid rgba(255,250,236,0.10)', paddingTop: 4,
        }}>
          {([
            { k: 'feed',     l: 'FEED',     ico: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 2l9 7.5V21a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z"/></svg>) },
            { k: 'discover', l: 'DISCOVER', ico: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>) },
            { k: 'messages', l: 'MESSAGES', ico: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>), badge: unreadCount },
          ] as const).map(t => {
            const active = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k as Tab)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '12px 0 14px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                position: 'relative',
              }}>
                <span style={{ color: active ? GOLD_L : 'rgba(255,250,236,0.55)', display: 'inline-flex', alignItems: 'center' }}>{t.ico}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em',
                  color: active ? GOLD_L : 'rgba(255,250,236,0.55)',
                }}>{t.l}</span>
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 36, height: 3, background: GOLD_L, borderRadius: 2,
                  }} />
                )}
                {('badge' in t) && (t.badge ?? 0) > 0 && (
                  <span style={{
                    position: 'absolute', top: 8, right: 'calc(50% - 26px)',
                    minWidth: 16, height: 16, borderRadius: 10,
                    background: '#DC2626', color: '#fff',
                    fontSize: 9, fontWeight: 800, padding: '0 4px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{t.badge && t.badge > 99 ? '99+' : t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────── */}
      {tab === 'feed'          && <CommunityFeedTab          key={feedKey} me={profile} onOpenComposer={() => setComposer(true)} />}
      {tab === 'discover'      && <CommunityDiscoverTab      me={profile} />}
      {tab === 'messages'      && <CommunityMessagesTab      me={profile} />}
      {tab === 'notifications' && <CommunityNotificationsTab me={profile} onUnreadChange={setUnreadCount} />}
      {tab === 'profile'       && <CommunityProfileTab       me={profile} onUpdate={setProfile} />}

      {composer && (
        <PostComposerModal
          me={profile}
          onClose={() => setComposer(false)}
          onPosted={() => { setComposer(false); setFeedKey(k => k + 1); setTab('feed'); }}
        />
      )}
    </div>
  );
}
