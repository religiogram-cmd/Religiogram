'use client';

/**
 * /astrology/browse — the astrologer marketplace.
 *
 * Filter chips at top (channel / online / verified), sort dropdown, and a
 * card list below. Query params drive initial filters so deep-links from
 * category tiles or "See all" links load with the right state.
 *
 * Mock data for Phase 1; Phase 2 swaps `listAstrologers()` for a real API
 * call to /astrology/astrologers backed by the existing `providers` table.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  listAstrologers,
  formatRupees,
  SPECIALIZATIONS,
  type Astrologer,
  type ConsultationChannel,
  type SortKey,
} from '@/lib/astrology-api';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

export default function BrowsePage() {
  const params = useSearchParams();
  const initialSpec = params?.get('specialization') ?? undefined;
  const initialCat  = params?.get('category') ?? undefined;
  const initialSort = (params?.get('sort') as SortKey) ?? 'popularity';

  const [channel,        setChannel]        = useState<ConsultationChannel | undefined>(undefined);
  const [onlineOnly,     setOnlineOnly]     = useState(false);
  const [verifiedOnly,   setVerifiedOnly]   = useState(false);
  const [specialization, setSpecialization] = useState<string | undefined>(initialSpec);
  const [sort,           setSort]           = useState<SortKey>(initialSort);

  // If we arrived with a category query (love / marriage / etc.), map it to
  // a relevant specialisation so the list narrows appropriately.
  useMemo(() => {
    if (!specialization && initialCat) {
      const map: Record<string, string> = {
        love: 'Love',
        marriage: 'Marriage',
        career: 'Career',
        business: 'Business',
        health: 'Health',
        compatibility: 'Match Making',
        muhurat: 'Muhurat',
        remedies: 'Lal Kitab',
      };
      const mapped = map[initialCat];
      if (mapped) setSpecialization(mapped);
    }
  }, [initialCat, specialization]);

  /* Fetch on filter/sort change. Backend now serves the marketplace, so
   * this is an async call — we render a spinner on the first load and
   * an inline pill during subsequent refetches so filter clicks feel
   * responsive. Every state change that affects the query fires a new
   * fetch; the API layer falls back to mock on failure. */
  const [results, setResults] = useState<Astrologer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const isFirst = results.length === 0;
    if (isFirst) setLoading(true); else setRefetching(true);
    listAstrologers({ channel, onlineOnly, verifiedOnly, specialization }, sort)
      .then((rows) => { if (!cancelled) setResults(rows); })
      .catch(() => { /* client already fell back to mock */ })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefetching(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, onlineOnly, verifiedOnly, specialization, sort]);

  return (
    <div style={{ background: CREAM, minHeight: '100svh', paddingBottom: 80 }}>
      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(255,250,236,0.95)',
        backdropFilter: 'saturate(180%) blur(10px)',
        padding: '14px 20px 12px',
        borderBottom: '1px solid rgba(15,36,82,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/astrology" style={{ color: NAVY, textDecoration: 'none', fontSize: 22, fontWeight: 700 }}>
            ←
          </Link>
          <h1 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 20, fontWeight: 700, color: NAVY,
            margin: 0, letterSpacing: '-0.01em', flex: 1,
          }}>
            Talk to Astrologer
          </h1>
        </div>

        {/* Channel chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip active={!channel}          onClick={() => setChannel(undefined)}>All</Chip>
          <Chip active={channel === 'chat'} onClick={() => setChannel('chat')}>💬 Chat</Chip>
          <Chip active={channel === 'voice'}onClick={() => setChannel('voice')}>📞 Voice</Chip>
          <Chip active={channel === 'video'}onClick={() => setChannel('video')}>🎥 Video</Chip>
          <Chip active={onlineOnly}         onClick={() => setOnlineOnly((v) => !v)}>● Online</Chip>
          <Chip active={verifiedOnly}       onClick={() => setVerifiedOnly((v) => !v)}>✓ Verified</Chip>
        </div>

        {/* Sort + spec */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              flex: 1, padding: '10px 12px',
              background: '#FFFFFF', border: '1px solid rgba(15,36,82,0.15)',
              borderRadius: 10, fontSize: 13, fontWeight: 600, color: NAVY,
            }}
          >
            <option value="popularity">Popularity</option>
            <option value="rating">Highest Rated</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="experience">Most Experienced</option>
            <option value="response">Fastest Response</option>
          </select>
          <select
            value={specialization ?? ''}
            onChange={(e) => setSpecialization(e.target.value || undefined)}
            style={{
              flex: 1, padding: '10px 12px',
              background: '#FFFFFF', border: '1px solid rgba(15,36,82,0.15)',
              borderRadius: 10, fontSize: 13, fontWeight: 600, color: NAVY,
            }}
          >
            <option value="">All Specialities</option>
            {SPECIALIZATIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Result count ── */}
      <div style={{ padding: '14px 20px 6px', fontSize: 12.5, color: TEXT2, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{results.length} astrologer{results.length !== 1 && 's'} available</span>
        {refetching && (
          <span aria-hidden style={{
            display: 'inline-block', width: 12, height: 12,
            borderRadius: '50%',
            border: '2px solid rgba(15,36,82,0.15)',
            borderTopColor: GOLD,
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
      </div>

      {/* Loading state (first fetch only) */}
      {loading && results.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span aria-hidden style={{
            display: 'inline-block', width: 28, height: 28,
            borderRadius: '50%',
            border: '3px solid rgba(15,36,82,0.15)',
            borderTopColor: GOLD,
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {/* Spinner keyframes — inline so we don't need a global stylesheet. */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── List ── */}
      <div style={{ padding: '4px 16px 20px' }}>
        {!loading && results.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: TEXT2, fontSize: 14,
          }}>
            No astrologers match your filters. Try widening them.
          </div>
        ) : (
          results.map((a) => <BrowseCard key={a.id} a={a} />)
        )}
      </div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: active
          ? `linear-gradient(135deg,${GOLD_L},${GOLD})`
          : '#FFFFFF',
        color: active ? NAVY : NAVY,
        border: `1px solid ${active ? GOLD : 'rgba(15,36,82,0.15)'}`,
        borderRadius: 999,
        fontSize: 12.5, fontWeight: 700,
        whiteSpace: 'nowrap', flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function BrowseCard({ a }: { a: Astrologer }) {
  return (
    <Link
      href={`/astrology/astrologer/${a.id}`}
      style={{
        display: 'block',
        background: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        border: '1px solid rgba(15,36,82,0.08)',
        textDecoration: 'none',
        marginBottom: 12,
        boxShadow: '0 4px 14px rgba(15,36,82,0.05)',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Avatar with status */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: `linear-gradient(135deg,${GOLD_L},${GOLD})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: NAVY, fontWeight: 800, fontSize: 24,
          }}>
            {a.name.split(' ').slice(-1)[0][0]}
          </div>
          {a.isOnline && (
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: a.isBusy ? '#F59E0B' : '#10B981',
              border: '2px solid #FFF',
            }} />
          )}
          {a.isLive && (
            <div style={{
              position: 'absolute', top: -4, left: -4,
              padding: '2px 6px', background: '#DC143C', color: '#fff',
              fontSize: 9, fontWeight: 800, borderRadius: 6, letterSpacing: '0.1em',
            }}>LIVE</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{a.name}</div>
            {a.isVerified && <span style={{ color: GOLD, fontSize: 13 }}>✓</span>}
            {a.isNew && (
              <span style={{
                padding: '2px 6px', background: '#10B981', color: '#fff',
                fontSize: 9, fontWeight: 800, borderRadius: 4, letterSpacing: '0.06em',
              }}>NEW</span>
            )}
          </div>

          <div style={{ fontSize: 12, color: TEXT2, marginTop: 3 }}>
            {a.specializations.slice(0, 3).map((s, i) => {
              const y = a.specializationYears?.[s];
              const prefix = i > 0 ? ' · ' : '';
              return (
                <span key={s}>
                  {prefix}
                  <span>{s}</span>
                  {y ? <span style={{ color: GOLD, fontWeight: 700 }}> · {y}y</span> : null}
                </span>
              );
            })}
            {a.specializations.length > 3 && (
              <span style={{ color: TEXT2 }}> · +{a.specializations.length - 3} more</span>
            )}
          </div>

          <div style={{ fontSize: 11.5, color: TEXT2, marginTop: 4 }}>
            {a.experienceYears} yrs total · {a.languages.join(', ')}
          </div>

          {/* Rating row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>★ {a.rating}</span>
            <span style={{ fontSize: 11, color: TEXT2 }}>({a.reviewCount.toLocaleString()} reviews)</span>
            <span style={{ fontSize: 11, color: TEXT2 }}>·</span>
            <span style={{ fontSize: 11, color: TEXT2 }}>{a.completedConsultations.toLocaleString()} calls</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: '1px solid rgba(15,36,82,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
            {formatRupees(a.ratePerMinPaise)}
            <span style={{ fontSize: 11, fontWeight: 600, color: TEXT2 }}>/min</span>
          </div>
          <div style={{
            fontSize: 10.5,
            color: a.isOnline ? '#10B981' : TEXT2,
            marginTop: 2, fontWeight: 700,
          }}>
            {a.isOnline
              ? (a.isBusy ? 'Busy' : 'Online now')
              : (a.nextAvailableSlot ? `Next: ${a.nextAvailableSlot}` : 'Offline')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {a.channels.includes('chat') && (
            <ChanIcon icon="💬" enabled={a.isOnline && !a.isBusy} />
          )}
          {a.channels.includes('voice') && (
            <ChanIcon icon="📞" enabled={a.isOnline && !a.isBusy} />
          )}
          {a.channels.includes('video') && (
            <ChanIcon icon="🎥" enabled={a.isOnline && !a.isBusy} />
          )}
          <div style={{
            padding: '9px 18px',
            background: a.isOnline
              ? `linear-gradient(135deg,${GOLD_L},${GOLD})`
              : '#E5E7EB',
            color: a.isOnline ? NAVY : '#6B7280',
            borderRadius: 999, fontSize: 12.5, fontWeight: 800,
          }}>
            {a.isOnline ? 'Consult' : 'Notify'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ChanIcon({ icon, enabled }: { icon: string; enabled: boolean }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: enabled ? '#F3F4F6' : '#F9FAFB',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, opacity: enabled ? 1 : 0.45,
    }}>
      {icon}
    </div>
  );
}
