'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

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
  {
    id: 'ai', label: 'AI Chat',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5"/>
      </svg>
    ),
  },
];

export default function AstrologyScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('astrologers');

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
        {/* Top bar */}
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
          <button
            onClick={() => {
              const btn = document.getElementById('astro-ai-trigger') as HTMLButtonElement | null;
              if (btn) btn.click();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 14px', borderRadius: 999,
              background: `linear-gradient(135deg, #D4A335 0%, ${GOLD} 60%, #A97520 100%)`,
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700,
              boxShadow: '0 3px 12px rgba(200,147,42,0.40)',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            AI Chat
          </button>
        </div>

        {/* Tab bar */}
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
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'astrologers' && <AstrologersTab />}
        {activeTab === 'horoscope'   && <HoroscopeTab />}
        {activeTab === 'kundli'      && <KundliTab />}
      </div>
    </div>
  );
}
