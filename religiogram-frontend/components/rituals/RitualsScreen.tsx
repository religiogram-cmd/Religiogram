'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tokenStore } from '@/lib/api';

const GOLD = '#C8920A';
const GOLD2 = '#E8A020';
const NAVY = '#0A1628';
const PARCH = '#F5E6C0';

const FAITH_META: Record<string, { color: string; emoji: string }> = {
  hindu:    { color: '#FF7043', emoji: '🪔' },
  muslim:   { color: '#2E7D52', emoji: '☪️' },
  sikh:     { color: '#E65100', emoji: '🟠' },
  christian:{ color: '#5C6BC0', emoji: '✝️' },
};

export default function RitualsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [services, setServices] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  /* Honour ?faith= from the Home page's faith cards. The Home
   * "Hindu / Muslim / Sikh / Christian" tiles link here with a faith
   * param, and we want the tab strip below to open on that faith
   * instead of the hard-coded default. Falls back to 'hindu' if the
   * param is missing or not one of the known faiths. */
  const initialFaith = (() => {
    const f = (searchParams?.get('faith') ?? '').toLowerCase();
    return f in FAITH_META ? f : 'hindu';
  })();
  const [activeFaith, setActiveFaith] = useState<string>(initialFaith);

  useEffect(() => {
    async function load() {
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE ?? '';
        const token = tokenStore.access ?? '';
        const res = await fetch(`${base}/priests/services`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setServices(data);
        }
      } catch {
        // Fallback data
        setServices({
          hindu:    ['Puja & Havans', 'Weddings', 'Naming Ceremonies', 'Funerals', 'Griha Shanti', 'Vastu Shanti', 'Satyanarayan Katha', 'Rudrabhishek'],
          muslim:   ['Nikah', 'Janaza', 'Aqeeqa', 'Quran Recitation', 'Islamic Counseling', 'Khatam', 'Bismillah Ceremony'],
          sikh:     ['Anand Karaj', 'Naam Karan', 'Antim Ardas', 'Akhand Path', 'Sukhmani Sahib', 'Kirtan', 'Dastar Bandi'],
          christian:['Baptism', 'Wedding', 'Funeral', 'Prayer Service', 'Pastoral Counseling', 'Mass', 'First Communion'],
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const faiths = Object.keys(services);

  if (loading) return (
    <div style={{ minHeight: '100svh', background: PARCH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${GOLD}40`, borderTopColor: GOLD, borderRadius: '50%' }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: PARCH, paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top,0px)', padding: '16px 20px 20px' }}>
        <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: '0 0 16px', fontFamily: '"Playfair Display",Georgia,serif', paddingTop: 14 }}>Rituals & Services</h1>
        {/* Faith tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {faiths.map(f => (
            <button key={f} onClick={() => setActiveFaith(f)} style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 100, cursor: 'pointer',
              background: activeFaith === f ? GOLD2 : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: activeFaith === f ? NAVY : 'rgba(255,255,255,0.7)',
              fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans",sans-serif',
              textTransform: 'capitalize',
            }}>{FAITH_META[f]?.emoji} {f}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px', fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
          Tap a service to find verified priests near you
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(services[activeFaith] ?? []).map((service: any) => (
            <button key={service} onClick={() => router.push(`/priests?faith=${activeFaith}&service=${encodeURIComponent(service)}`)}
              style={{
                background: '#fff', borderRadius: 16, padding: '18px 14px',
                border: `1.5px solid ${FAITH_META[activeFaith]?.color ?? GOLD}25`,
                cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0, fontFamily: '"Plus Jakarta Sans",sans-serif', lineHeight: 1.35 }}>{service}</p>
              <p style={{ fontSize: 11, color: GOLD, margin: '6px 0 0', fontWeight: 600, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Find Priest →</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
