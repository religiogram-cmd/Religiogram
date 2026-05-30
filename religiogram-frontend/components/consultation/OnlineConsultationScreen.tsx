'use client';

import { useState, useEffect } from 'react';
import { tokenStore } from '@/lib/api';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';

const NAVY = '#1B2A5C';
const GOLD = '#C8920A';
const PARCHMENT = '#FFFBF0';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

interface Consultant {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  rating: number;
  sessions: number;
  languages: string;
  experience: string;
  ratePerMin: number;   // in rupees
  online: boolean;
  category: string[];
}

function mapProvider(p: any): Consultant {
  const name: string = p.displayName ?? p.name ?? 'Unknown';
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return {
    id: p.id,
    name,
    initials,
    specialty: (p.services ?? []).slice(0, 2).join(', ') || p.specialty || 'Spiritual Guide',
    rating: typeof p.rating === 'number' ? p.rating : parseFloat(p.averageRating ?? '4.7'),
    sessions: p.totalSessions ?? p.sessions ?? 0,
    languages: Array.isArray(p.languages) ? p.languages.join(', ') : (p.languages ?? 'Hindi'),
    experience: p.yearsExperience ? `${p.yearsExperience} yrs` : (p.experience ?? ''),
    ratePerMin: p.pricePerMinute ?? Math.round((p.pricePerMinutePaise ?? 3500) / 100),
    online: p.isOnline ?? p.online ?? false,
    category: p.category ?? p.services ?? [],
  };
}

const FILTER_PILLS = [
  'All', 'Astrology', 'Kundli', 'Palm Reading',
  'Islamic Guidance', 'Tarot', 'Vastu', 'Prayer Counseling',
];

/* ─── PreSessionDialog ──────────────────────────────────────────── */

interface PreSessionDialogProps {
  consultant: Consultant;
  walletBalance: number;
  onClose: () => void;
  onStartSession: (providerId: string, mode: 'chat' | 'call') => void;
}

function PreSessionDialog({ consultant, walletBalance, onClose, onStartSession }: PreSessionDialogProps) {
  const est15 = consultant.ratePerMin * 15;
  const est30 = consultant.ratePerMin * 30;
  const est60 = consultant.ratePerMin * 60;
  const approxMins = consultant.ratePerMin > 0 ? Math.floor(walletBalance / consultant.ratePerMin) : 0;
  const sufficient = walletBalance >= consultant.ratePerMin * 5;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', backgroundColor: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px 40px',
          maxHeight: '85vh', overflowY: 'auto',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', margin: '0 auto 20px' }} />
        <button
          onClick={onClose}
          style={{
            position: 'absolute', right: 20, top: 20,
            background: '#f5f5f5', border: 'none', borderRadius: '50%',
            width: 32, height: 32, cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}
        >×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', backgroundColor: NAVY,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0,
          }}>{consultant.initials}</div>
          <div>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>{consultant.name}</div>
            <div style={{ color: '#666', fontSize: 13 }}>{consultant.specialty}</div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 15, marginTop: 2 }}>{formatPerMinute(consultant.ratePerMin * 100)}</div>
          </div>
        </div>

        <div style={{ backgroundColor: PARCHMENT, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: NAVY, fontSize: 14, marginBottom: 10 }}>Estimated Cost</div>
          {[{ label: '15 min', cost: est15 }, { label: '30 min', cost: est30 }, { label: '60 min', cost: est60 }].map(({ label, cost }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #e8e0d0' }}>
              <span style={{ color: '#555', fontSize: 13 }}>{label}</span>
              <span style={{ color: NAVY, fontWeight: 600, fontSize: 13 }}>{formatRupees(cost)}</span>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: sufficient ? '#f0fdf4' : '#fff7ed', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{sufficient ? '💚' : '⚠️'}</span>
          <div style={{ color: sufficient ? '#166534' : '#9a3412', fontSize: 13, fontWeight: 600 }}>
            Your wallet: {formatRupees(walletBalance)} — approx {approxMins} min at {formatPerMinute(consultant.ratePerMin * 100)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={() => onStartSession(consultant.id, 'chat')} style={{ flex: 1, padding: '13px 0', backgroundColor: GOLD, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            💬 Start Session
          </button>
          <button onClick={() => onStartSession(consultant.id, 'call')} style={{ flex: 1, padding: '13px 0', backgroundColor: '#fff', color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            📞 Call
          </button>
        </div>

        {!sufficient && (
          <button style={{ width: '100%', padding: '12px 0', backgroundColor: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Add Money First
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── ConsultantCard ────────────────────────────────────────────── */

interface ConsultantCardProps {
  consultant: Consultant;
  onOpen: (c: Consultant) => void;
}

function ConsultantCard({ consultant, onOpen }: ConsultantCardProps) {
  const est15 = consultant.ratePerMin * 15;
  return (
    <div style={{ backgroundColor: '#fff', border: `1.5px solid ${consultant.online ? GOLD : '#e5e7eb'}`, borderRadius: 14, padding: '14px', marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
            {consultant.initials}
          </div>
          <div style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%', backgroundColor: consultant.online ? '#22c55e' : '#9ca3af', border: '2px solid #fff' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: 14, lineHeight: 1.3 }}>{consultant.name}</div>
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }}>{consultant.specialty}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>★{consultant.rating.toFixed(1)}</span>
            <span style={{ color: '#9ca3af', fontSize: 11 }}>({consultant.sessions.toLocaleString()} sessions)</span>
          </div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{consultant.languages}{consultant.experience ? ` · ${consultant.experience}` : ''}</div>
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: 11, color: consultant.online ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
              {consultant.online ? '● Online' : '● Offline'}
            </span>
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>{formatPerMinute(consultant.ratePerMin * 100)}</div>
            <div style={{ color: '#9ca3af', fontSize: 10 }}>est. {formatRupees(est15)} for 15 min</div>
          </div>
          <button onClick={() => onOpen(consultant)} disabled={!consultant.online} style={{ padding: '6px 12px', backgroundColor: consultant.online ? GOLD : '#e5e7eb', color: consultant.online ? '#fff' : '#9ca3af', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: consultant.online ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
            Chat Now
          </button>
          <button onClick={() => onOpen(consultant)} disabled={!consultant.online} style={{ padding: '5px 12px', backgroundColor: '#fff', color: consultant.online ? GOLD : '#9ca3af', border: `1.5px solid ${consultant.online ? GOLD : '#e5e7eb'}`, borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: consultant.online ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
            Call
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, border: '1.5px solid #e5e7eb' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#f3f4f6', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, width: '60%', backgroundColor: '#f3f4f6', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 12, width: '45%', backgroundColor: '#f3f4f6', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 12, width: '35%', backgroundColor: '#f3f4f6', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────── */

interface Props {
  providerId?: string;
  onBack?: () => void;
  onStartSession?: (providerId: string, mode: 'chat' | 'call') => void;
}

export default function OnlineConsultationScreen({ providerId, onBack, onStartSession }: Props) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);

  // Fetch wallet balance
  useEffect(() => {
    const token = tokenStore.access;
    if (!token) return;
    fetch(`${API}/api/v1/wallet/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWalletBalance(d.balancePaise ? Math.round(d.balancePaise / 100) : (d.balance ?? 0)); })
      .catch(() => {});
  }, []);

  // Fetch providers
  useEffect(() => {
    setLoading(true);
    const url = providerId
      ? `${API}/api/v1/priests/${providerId}`
      : `${API}/api/v1/priests?serviceType=online&limit=30`;
    const token = tokenStore.access;
    fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setLoading(false); return; }
        if (providerId) {
          // Single provider — show pre-session dialog automatically
          const c = mapProvider(d);
          setConsultants([c]);
          setSelectedConsultant(c);
        } else {
          const list: any[] = Array.isArray(d) ? d : (d.data ?? d.priests ?? d.providers ?? []);
          setConsultants(list.map(mapProvider));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [providerId]);

  const filtered = activeFilter === 'All'
    ? consultants
    : consultants.filter(c => c.category.some(cat => cat.toLowerCase().includes(activeFilter.toLowerCase())));

  const available = filtered.filter(c => c.online);
  const offline   = filtered.filter(c => !c.online);

  const handleStartSession = (pId: string, mode: 'chat' | 'call') => {
    setSelectedConsultant(null);
    if (onStartSession) onStartSession(pId, mode);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: PARCHMENT, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: NAVY, padding: '52px 20px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <div>
            <h1 style={{ color: '#fff', fontWeight: 700, fontSize: 20, margin: 0 }}>Online Consultation</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '2px 0 0' }}>Chat or call verified spiritual guides</p>
          </div>
        </div>
      </div>

      {/* Filter bar — only show on browse mode */}
      {!providerId && (
        <div style={{ backgroundColor: '#fff', position: 'sticky', top: 108, zIndex: 90, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '10px 0' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
            {FILTER_PILLS.map(pill => (
              <button key={pill} onClick={() => setActiveFilter(pill)} style={{ padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${activeFilter === pill ? GOLD : NAVY}`, backgroundColor: activeFilter === pill ? GOLD : '#fff', color: activeFilter === pill ? '#fff' : NAVY, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>
                {pill}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '20px 16px 100px' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : consultants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔮</div>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 16, marginBottom: 6 }}>No consultants available</div>
            <div style={{ fontSize: 13 }}>Try a different filter or check back later.</div>
          </div>
        ) : (
          <>
            {available.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <h2 style={{ fontWeight: 700, color: NAVY, fontSize: 17, margin: 0 }}>Available Now</h2>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
                </div>
                {available.map(c => <ConsultantCard key={c.id} consultant={c} onOpen={setSelectedConsultant} />)}
              </section>
            )}

            {offline.length > 0 && (
              <section>
                <h2 style={{ fontWeight: 700, color: NAVY, fontSize: 17, marginBottom: 14 }}>Other Guides</h2>
                {offline.map(c => <ConsultantCard key={c.id} consultant={c} onOpen={setSelectedConsultant} />)}
              </section>
            )}
          </>
        )}
      </div>

      {selectedConsultant && (
        <PreSessionDialog
          consultant={selectedConsultant}
          walletBalance={walletBalance}
          onClose={() => setSelectedConsultant(null)}
          onStartSession={handleStartSession}
        />
      )}
    </div>
  );
}
