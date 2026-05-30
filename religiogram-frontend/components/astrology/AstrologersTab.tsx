'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

const FILTERS = ['All', 'Love', 'Career', 'Marriage', 'Health', 'Wealth', 'Legal', 'Tarot', 'Vedic', 'KP', 'Numerology', 'Education'];
const NAVY = '#0F2452';
const GOLD = '#C8932A';

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#F4B400" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#1976D2" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"/>
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#F4B400" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z"/>
    </svg>
  );
}

function CallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>
  );
}

type Astrologer = {
  id: number | string;
  name: string;
  initials: string;
  specialties: string[];
  languages: string[];
  rating: number;
  reviews: number;
  experience: number;
  pricePerMin: number;
  online: boolean;
  verified: boolean;
  celebrity: boolean;
  orders: string;
  color: string;
};

function AstrologerCard({ a, onChat, onCall }: { a: Astrologer; onChat: () => void; onCall: () => void }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(15,36,82,0.08)',
      border: '1px solid rgba(15,36,82,0.08)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Avatar row */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ position: 'relative', marginBottom: 2 }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            background: a.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
            fontFamily: '"Plus Jakarta Sans","Arial Black",sans-serif',
            border: `2.5px solid ${GOLD}`,
          }}>
            {a.initials}
          </div>
          {/* Online dot */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 11, height: 11, borderRadius: '50%',
            background: a.online ? '#22c55e' : '#9ca3af',
            border: '2px solid #fff',
          }} />
          {/* Celebrity badge */}
          {a.celebrity && (
            <div style={{
              position: 'absolute', top: -4, right: -4,
              background: '#FFF9C4', borderRadius: 6, padding: '1px 3px',
              display: 'flex', alignItems: 'center', gap: 1,
              border: '1px solid #F4B400',
            }}>
              <CrownIcon />
            </div>
          )}
        </div>

        {/* Name + verified */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: NAVY,
            textAlign: 'center', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 110,
          }}>{a.name}</span>
          {a.verified && <VerifiedIcon />}
        </div>

        {/* Specialties */}
        <p style={{ fontSize: 10.5, color: '#64748b', textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
          {a.specialties.join(' • ')}
        </p>

        {/* Language */}
        <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
          {a.languages.join(', ')}
        </p>

        {/* Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <StarIcon />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{a.rating}</span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>({a.orders})</span>
        </div>

        {/* Exp + Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>Exp: {a.experience} yrs</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: NAVY }}>{formatPerMinute(a.pricePerMin * 100)}</span>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: '10px 10px 12px', display: 'flex', gap: 6 }}>
        <button
          onClick={onChat}
          style={{
            flex: 1, height: 32, borderRadius: 8,
            background: a.online ? '#16a34a' : '#e2e8f0',
            color: a.online ? '#fff' : '#94a3b8',
            border: 'none', cursor: a.online ? 'pointer' : 'not-allowed',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <ChatBubbleIcon />
          Chat
        </button>
        <button
          onClick={onCall}
          style={{
            flex: 1, height: 32, borderRadius: 8,
            background: '#fff',
            color: a.online ? NAVY : '#94a3b8',
            border: `1.5px solid ${a.online ? NAVY : '#e2e8f0'}`,
            cursor: a.online ? 'pointer' : 'not-allowed',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <CallIcon />
          Call
        </button>
      </div>
    </div>
  );
}

function ConnectModal({ astrologer, mode, onClose }: { astrologer: Astrologer; mode: 'chat' | 'call'; onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState('');

  const handleStart = async () => {
    setStarting(true);
    setErr('');
    try {
      const token = tokenStore.access ?? '';
      const res = await fetch(`${API_BASE}/api/v1/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: String(astrologer.id),
          serviceName: mode === 'chat' ? 'Online Chat Consultation' : 'Online Call Consultation',
          type: 'online',
          scheduledAt: new Date().toISOString(),
          durationMinutes: 5,
          amountPaise: astrologer.pricePerMin * 5 * 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Could not start session');
      const bookingId: string = json?.data?.id ?? json?.id;
      if (!bookingId) throw new Error('No session ID returned');
      onClose();
      router.push(`/consultation/${bookingId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to start session');
      setStarting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', background: '#fff', borderRadius: '20px 20px 0 0',
          padding: '24px 20px 36px', maxWidth: 480, margin: '0 auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: astrologer.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff', border: `2px solid ${GOLD}`,
          }}>{astrologer.initials}</div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 15 }}>{astrologer.name}</p>
            <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{astrologer.specialties.join(', ')}</p>
          </div>
        </div>

        <div style={{
          background: '#F0F4FF', borderRadius: 10, padding: '12px 14px', marginBottom: 20,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: NAVY, fontWeight: 600 }}>
            {mode === 'chat' ? '💬 Chat Session' : '📞 Call Session'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            Rate: <strong>{formatPerMinute(astrologer.pricePerMin * 100)}</strong> · Minimum 5 minutes
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
            Minimum charge: <strong>{formatRupees(astrologer.pricePerMin * 5)}</strong>
          </p>
        </div>

        {err && (
          <p style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{err}</p>
        )}

        <button
          disabled={starting}
          style={{
            width: '100%', height: 48, borderRadius: 12,
            background: starting ? '#94a3b8' : `linear-gradient(135deg, ${NAVY}, #0F2452)`,
            color: '#fff', border: 'none', fontSize: 15, fontWeight: 700,
            cursor: starting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          onClick={handleStart}
        >
          {starting
            ? <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Connecting…</>
            : (mode === 'chat' ? `Start Chat — ${formatRupees(astrologer.pricePerMin * 5)} min` : `Start Call — ${formatRupees(astrologer.pricePerMin * 5)} min`)
          }
        </button>
        <button
          style={{
            width: '100%', marginTop: 10, height: 40, borderRadius: 10,
            background: 'transparent', color: '#94a3b8', border: 'none', fontSize: 14, cursor: 'pointer',
          }}
          onClick={onClose}
        >Cancel</button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function AstrologersTab() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [modal, setModal] = useState<{ astrologer: Astrologer; mode: 'chat' | 'call' } | null>(null);
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [astrologers, setAstrologers] = useState<Astrologer[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Load live astrologer data from the providers/priests API ─────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/v1/priests?category=astrology&limit=20&page=1`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (cancelled) return;
        const items: Astrologer[] = (data?.data ?? data?.priests ?? []).map((p: any, i: number) => ({
          id:          p.id ?? i,
          name:        p.displayName ?? p.name ?? 'Astrologer',
          initials:    (p.displayName ?? p.name ?? 'A').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase(),
          specialties: p.services?.map((s: any) => s.serviceName ?? s) ?? ['Vedic'],
          languages:   p.languages ?? ['Hindi'],
          rating:      Number(p.ratingAvg ?? 4.5),
          reviews:     p.ratingCount ?? 0,
          experience:  p.experienceYears ?? 5,
          pricePerMin: Math.round((p.pricePerMinutePaise ?? 1500) / 100),
          online:      p.isOnline ?? false,
          verified:    p.isVerified ?? false,
          celebrity:   (p.ratingCount ?? 0) > 10000,
          orders:      p.ratingCount ? `${Math.round(p.ratingCount / 1000)}k+` : '0',
          color:       ['#0F2452','#7B2D8B','#C17F24','#2E7D32','#AD1457'][i % 5],
        }));
        if (items.length > 0) setAstrologers(items);
      })
      .catch(() => { /* keep fallback data */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = astrologers;
    if (showOnlineOnly) list = list.filter((a: any) => a.online);
    if (activeFilter !== 'All') list = list.filter((a: any) => a.specialties.includes(activeFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a: any) =>
        a.name.toLowerCase().includes(q) ||
        a.specialties.some((s: any) => s.toLowerCase().includes(q)) ||
        a.languages.some((l: any) => l.toLowerCase().includes(q))
      );
    }
    return list;
  }, [search, activeFilter, showOnlineOnly, astrologers]);

  return (
    <div style={{ background: '#F6F7FA', minHeight: '100%' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px 0', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#F6F7FA', borderRadius: 10, padding: '8px 12px',
          border: '1.5px solid #e2e8f0',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#94a3b8" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#94a3b8" strokeWidth="2" fill="none" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search astrologers..."
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, color: '#374151', outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#94a3b8"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
        </div>

        {/* Online toggle + filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 10px', overflowX: 'auto' }}>
          <button
            onClick={() => setShowOnlineOnly((v: any) => !v)}
            style={{
              flexShrink: 0, height: 30, paddingInline: 10, borderRadius: 8,
              border: `1.5px solid ${showOnlineOnly ? '#16a34a' : '#e2e8f0'}`,
              background: showOnlineOnly ? '#dcfce7' : '#fff',
              color: showOnlineOnly ? '#16a34a' : '#64748b',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            Online
          </button>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                flexShrink: 0, height: 30, paddingInline: 12, borderRadius: 8,
                border: `1.5px solid ${activeFilter === f ? NAVY : '#e2e8f0'}`,
                background: activeFilter === f ? NAVY : '#fff',
                color: activeFilter === f ? '#fff' : '#64748b',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ padding: '10px 16px 4px' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
          {filtered.length} astrologers {showOnlineOnly ? '· Online' : ''} {activeFilter !== 'All' ? `· ${activeFilter}` : ''}
        </p>
      </div>

      {/* Loading skeleton — shown only on initial fetch before data arrives */}
      {loading && astrologers.length === 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12, padding: '8px 14px 100px',
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 14,
              boxShadow: '0 2px 12px rgba(15,36,82,0.06)',
              border: '1px solid rgba(15,36,82,0.06)',
              padding: '14px 14px 12px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#e2e8f0' }} />
              <div style={{ width: 90, height: 10, borderRadius: 5, background: '#e2e8f0' }} />
              <div style={{ width: 110, height: 8, borderRadius: 5, background: '#f1f5f9' }} />
              <div style={{ width: 70, height: 8, borderRadius: 5, background: '#f1f5f9' }} />
              <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                <div style={{ flex: 1, height: 32, borderRadius: 8, background: '#e2e8f0' }} />
                <div style={{ flex: 1, height: 32, borderRadius: 8, background: '#f1f5f9' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>🔭</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#475569' }}>No astrologers found</p>
          <p style={{ fontSize: 13 }}>Try a different filter or search term</p>
        </div>
      ) : !loading ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12, padding: '8px 14px 100px',
        }}>
          {filtered.map((a: any) => (
            <AstrologerCard
              key={a.id}
              a={a}
              onChat={() => a.online && setModal({ astrologer: a, mode: 'chat' })}
              onCall={() => a.online && setModal({ astrologer: a, mode: 'call' })}
            />
          ))}
        </div>
      ) : null}

      {/* Connect modal */}
      {modal && (
        <ConnectModal
          astrologer={modal.astrologer}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

 