'use client';
import { useState, useEffect } from 'react';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';
import { apiFetch } from '@/lib/api';

const NAVY  = '#1B2A5C';
const GOLD  = '#C8920A';
const PARCH = '#FFFBF0';
const WHITE = '#FFFFFF';
const MUTED = '#7A6650';

const CATEGORIES = ['All', 'Hindu', 'Muslim', 'Sikh', 'Christian', 'Astrology', 'Online', 'Offline'];

const SERVICES = [
  { emoji: '🙏', label: 'Satyanarayan Katha', from: 2500 },
  { emoji: '💒', label: 'Wedding Ritual',      from: 15000 },
  { emoji: '⭐', label: 'Kundli Reading',       from: 500 },
  { emoji: '🌙', label: 'Nikah',                from: 5000 },
  { emoji: '🎵', label: 'Anand Karaj',          from: 8000 },
  { emoji: '🕊️', label: 'Prayer Counseling',   from: 300 },
  { emoji: '🏠', label: 'Griha Pravesh',        from: 5000 },
  { emoji: '🔮', label: 'Tarot',                from: 400 },
];

const FAITHS = [
  { emoji: '🕉️', name: 'Hindu',    services: 42, providers: '280+' },
  { emoji: '☪️',  name: 'Muslim',   services: 18, providers: '95+' },
  { emoji: '🪯',  name: 'Sikh',     services: 12, providers: '64+' },
  { emoji: '✝️',  name: 'Christian',services: 14, providers: '72+' },
];

const EMERGENCY_CHIPS = ['Last Rites Assistance', 'Crisis Prayer Support', 'Same-Day Katha'];

interface Provider {
  id: string;
  fullName?: string;
  name?: string;
  ratingAvg?: number | null;
  pricePerMin?: number | null;
  isOnline?: boolean;
  avatarUrl?: string | null;
  specialty?: string;
  services?: Array<{ basePricePaise?: number }>;
}

export default function ExploreScreen() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [showPriceFilter, setShowPriceFilter] = useState(false);

  const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
    { label: 'Any Price',  min: null,   max: null  },
    { label: '< ₹10/min', min: null,   max: 1000  },
    { label: '₹10–₹30',   min: 1000,  max: 3000  },
    { label: '₹30–₹50',   min: 3000,  max: 5000  },
    { label: '> ₹50/min', min: 5000,  max: null  },
  ];
  const [activePricePreset, setActivePricePreset] = useState(0);

  useEffect(() => {
    setLoading(true);
    const categoryParam = activeCategory !== 'All' ? `&category=${encodeURIComponent(activeCategory.toLowerCase())}` : '';
    const minParam = minPrice != null ? `&minPrice=${minPrice}` : '';
    const maxParam = maxPrice != null ? `&maxPrice=${maxPrice}` : '';
    apiFetch<{ items: Provider[]; data?: Provider[] } | Provider[]>(
      `/providers?limit=20&isOnline=true${categoryParam}${minParam}${maxParam}`,
      { auth: true }
    )
      .then(res => {
        if (Array.isArray(res)) {
          setProviders(res);
        } else if ('items' in res && Array.isArray(res.items)) {
          setProviders(res.items);
        } else if ('data' in res && Array.isArray((res as { data: Provider[] }).data)) {
          setProviders((res as { data: Provider[] }).data);
        } else {
          setProviders([]);
        }
      })
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [activeCategory, minPrice, maxPrice]);

  return (
    <div style={{ background: PARCH, minHeight: '100vh', paddingBottom: 88 }}>

      {/* Sticky Header + Search */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: PARCH,
        padding: '16px 16px 12px',
        boxShadow: '0 2px 8px rgba(27,42,92,0.08)',
      }}>
        <h1 style={{ fontFamily: 'Cinzel, serif', color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>
          Explore
        </h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: WHITE, borderRadius: 50,
          padding: '10px 16px',
          boxShadow: '0 2px 12px rgba(27,42,92,0.10)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={MUTED} strokeWidth="2"/>
            <path d="M16.5 16.5L21 21" stroke={MUTED} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search rituals, providers, astrology…"
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              flex: 1, fontSize: 14, color: NAVY,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          />
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '14px 16px', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => {
          const isActive = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flexShrink: 0,
                padding: '7px 16px',
                borderRadius: 50,
                border: isActive ? 'none' : `1.5px solid rgba(27,42,92,0.2)`,
                background: isActive ? GOLD : WHITE,
                color: isActive ? WHITE : NAVY,
                fontSize: 13, fontWeight: 600,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                cursor: 'pointer',
                boxShadow: isActive ? '0 2px 8px rgba(200,146,10,0.30)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Price Filter Pills */}
      <div style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 12px', scrollbarWidth: 'none' }}>
        {PRICE_PRESETS.map((preset, idx) => {
          const isActive = idx === activePricePreset;
          return (
            <button
              key={preset.label}
              onClick={() => {
                setActivePricePreset(idx);
                setMinPrice(preset.min);
                setMaxPrice(preset.max);
              }}
              style={{
                flexShrink: 0, padding: '5px 14px', borderRadius: 50,
                border: isActive ? 'none' : '1.5px solid rgba(27,42,92,0.15)',
                background: isActive ? NAVY : 'rgba(255,255,255,0.8)',
                color: isActive ? '#fff' : NAVY,
                fontSize: 12, fontWeight: 600,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                cursor: 'pointer',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Popular Services */}
      <section style={{ padding: '0 16px 20px' }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', color: NAVY, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Popular Services
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {SERVICES.map(svc => (
            <div key={svc.label} style={{
              background: WHITE,
              borderRadius: 14,
              padding: '14px 12px',
              boxShadow: '0 2px 10px rgba(27,42,92,0.08)',
              display: 'flex', flexDirection: 'column', gap: 6,
              border: '1px solid rgba(200,146,10,0.12)',
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 28 }}>{svc.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, fontFamily: '"Plus Jakarta Sans", sans-serif', lineHeight: 1.3 }}>
                {svc.label}
              </span>
              <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                from {formatRupees(svc.from)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Browse by Faith */}
      <section style={{ padding: '0 16px 20px' }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', color: NAVY, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Browse by Faith
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {FAITHS.map(f => (
            <div key={f.name} style={{
              background: WHITE,
              borderRadius: 14,
              padding: '16px 14px',
              boxShadow: '0 2px 10px rgba(27,42,92,0.08)',
              border: '1px solid rgba(200,146,10,0.12)',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{f.emoji}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {f.name}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {f.services} services · {f.providers} providers
              </div>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginTop: 8, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                Explore →
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Available Online Now */}
      <section style={{ padding: '0 0 20px' }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', color: NAVY, fontSize: 16, fontWeight: 700, margin: '0 16px 14px' }}>
          Available Online Now
        </h2>

        {loading ? (
          /* Loading spinner */
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px 0' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `3px solid rgba(200,146,10,0.2)`,
              borderTopColor: GOLD,
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : providers.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '24px 16px', color: MUTED, fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: 13 }}>
            No providers online right now. Check back soon.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', display: 'flex', gap: 12, padding: '0 16px', scrollbarWidth: 'none' }}>
            {providers.map(p => {
              const displayName = p.fullName ?? p.name ?? 'Provider';
              const rating = p.ratingAvg ?? null;
              const pricePerMinPaise = p.pricePerMin != null
                ? p.pricePerMin
                : (p.services?.[0]?.basePricePaise ?? null);
              return (
                <div key={p.id} style={{
                  flexShrink: 0, width: 150,
                  background: WHITE,
                  borderRadius: 14,
                  padding: '14px',
                  boxShadow: '0 2px 10px rgba(27,42,92,0.08)',
                  border: '1px solid rgba(200,146,10,0.12)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Online</span>
                  </div>
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={displayName}
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
                    />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}33, ${NAVY}22)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 20 }}>
                      🧘
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: 2 }}>
                    {displayName}
                  </div>
                  {p.specialty && (
                    <div style={{ fontSize: 10, color: MUTED, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: 6, lineHeight: 1.4 }}>
                      {p.specialty}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {pricePerMinPaise != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        {formatPerMinute(pricePerMinPaise)}
                      </span>
                    )}
                    {rating != null && (
                      <span style={{ fontSize: 11, color: NAVY, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        {rating.toFixed(1)}★
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Emergency Services */}
      <section style={{ padding: '0 16px 20px' }}>
        <div style={{
          border: '1.5px solid #ef4444',
          borderRadius: 16,
          padding: '16px',
          background: '#fff5f5',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: '#b91c1c', fontSize: 15, fontWeight: 700, margin: 0 }}>
              Emergency Services
            </h2>
          </div>
          <p style={{ fontSize: 12, color: '#7f1d1d', margin: '0 0 12px', fontFamily: '"Plus Jakarta Sans", sans-serif', lineHeight: 1.5 }}>
            Same-day booking available for urgent ceremonial needs. Verified providers respond within 30 minutes.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EMERGENCY_CHIPS.map(chip => (
              <span key={chip} style={{
                background: '#fee2e2', color: '#b91c1c',
                padding: '6px 12px', borderRadius: 50,
                fontSize: 12, fontWeight: 600,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                border: '1px solid #fca5a5',
              }}>
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
