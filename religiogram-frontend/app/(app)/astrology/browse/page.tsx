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
  type ListFilters,
  type SortKey,
} from '@/lib/astrology-api';
import FiltersSheet, {
  EMPTY_FILTERS,
  countActiveFilters,
  SESSION_KEY,
  type SheetFilters,
} from '@/components/astrology/FiltersSheet';
import WalletBadge from '@/components/wallet/WalletBadge';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';

/* Topic quick-chips — AstroTalk-style pinned above the main filter row.
 * Each key must match an option in FiltersSheet TOPIC_OPTS so the sheet's
 * count-badge/selection state stays in sync when a chip is tapped. Icons
 * are inline SVGs so we don't need extra assets. */
const TOPIC_CHIPS: Array<{ key: string; label: string; icon: React.ReactNode; color: string }> = [
  { key: '',        label: 'All',       color: '#F5B301', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>
  )},
  { key: 'Love',    label: 'Love',      color: '#EF4444', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  )},
  { key: 'Education',label:'Education', color: '#7C3AED', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
  )},
  { key: 'Career',  label: 'Career',    color: '#0EA5E9', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
  )},
  { key: 'Marriage',label: 'Marriage',  color: '#EC4899', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="14" r="6"/><circle cx="15" cy="14" r="6"/></svg>
  )},
  { key: 'Health',  label: 'Health',    color: '#F97316', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3"/><path d="M12 11v6M9 14h6"/></svg>
  )},
  { key: 'Finance', label: 'Wealth',    color: '#8B5CF6', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="18" cy="12" r="1.4"/></svg>
  )},
  { key: 'Legal',   label: 'Legal',     color: '#0F172A', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M5 8h14M4 8l3 8h4l-3-8M20 8l-3 8h-4l3-8"/></svg>
  )},
  { key: 'Business',label: 'Business',  color: '#10B981', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  )},
  { key: 'Family',  label: 'Family',    color: '#F59E0B', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 21c0-3 2.5-5 5-5s5 2 5 5M12 21c0-3 2.5-5 5-5s5 2 5 5"/></svg>
  )},
  { key: 'Children',label: 'Children',  color: '#3B82F6', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M6 21c0-3 3-5 6-5s6 2 6 5"/></svg>
  )},
];

export default function BrowsePage() {
  const params = useSearchParams();
  const initialSpec = params?.get('specialization') ?? undefined;
  const initialCat  = params?.get('category') ?? undefined;
  const initialSort = (params?.get('sort') as SortKey) ?? 'popularity';

  /* ─── Quick filter (top-bar) state ─────────────────────────────────
   * These 3 chips + Filters button drive the top row. `quickFilter`
   * overrides sort order (top => sort by rating) and adds an onlineOnly
   * predicate when set to 'online'. The full-filters sheet lives in a
   * separate state tree so quick + sheet don't fight each other. */
  const [quickFilter, setQuickFilter] = useState<'all' | 'online' | 'top'>('all');
  const [specialization, setSpecialization] = useState<string | undefined>(initialSpec);
  const [sort, setSort] = useState<SortKey>(initialSort);

  /* ─── Full filters (bottom-sheet) state ────────────────────────────
   * `sheetFilters` is the committed value applied to queries. The sheet
   * component owns its own draft state internally and only calls onApply
   * when the user hits Apply. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFilters, setSheetFilters] = useState<SheetFilters>(EMPTY_FILTERS);
  const activeFilterCount = useMemo(() => countActiveFilters(sheetFilters), [sheetFilters]);

  /* ─── Topic quick-chip + search (AstroTalk-style) ──────────────────
   * A single-select topic chip pinned above the filter row. Sets exactly
   * one entry into `sheetFilters.topics` on click, clears it when "All"
   * is picked. Search does client-side name matching over `results`. */
  const [topic, setTopic] = useState<string>(''); // '' = All
  const [nameQuery, setNameQuery] = useState('');
  const setTopicChip = (t: string) => {
    setTopic(t);
    setSheetFilters((f) => ({ ...f, topics: t ? [t] : [] }));
  };

  /* Name search is a client-side substring match — cheap and instant.
   * Runs on top of the API result set every render. */
  const applyNameSearch = (rows: Astrologer[]): Astrologer[] => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((a) => a.name.toLowerCase().includes(q));
  };

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

  // Clear persisted sheet selections when the browse page unmounts so a
  // fresh session doesn't inherit stale filters.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      }
    };
  }, []);

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

    // Compose the ListFilters for the API layer. Quick-filter overrides
    // stack on top of sheetFilters — 'online' forces onlineOnly=true,
    // 'top' bumps minRating floor and re-sorts by rating.
    const effectiveSort: SortKey = quickFilter === 'top' ? 'rating' : sort;
    const effectiveOnline = quickFilter === 'online' ? true : undefined;

    const apiFilters: ListFilters = {
      specialization,
      onlineOnly: effectiveOnline,
      channels:            sheetFilters.channels.length ? sheetFilters.channels : undefined,
      availability:        sheetFilters.availability.length ? sheetFilters.availability : undefined,
      languages:           sheetFilters.languages.length ? sheetFilters.languages : undefined,
      specializations:     sheetFilters.specializations.length ? sheetFilters.specializations : undefined,
      topics:              sheetFilters.topics.length ? sheetFilters.topics : undefined,
      experienceBands:     sheetFilters.experienceBands.length ? sheetFilters.experienceBands : undefined,
      gender:              sheetFilters.gender,
      minRating:           sheetFilters.minRating,
      minPricePaise:       sheetFilters.minPricePaise !== EMPTY_FILTERS.minPricePaise ? sheetFilters.minPricePaise : undefined,
      maxPricePaise:       sheetFilters.maxPricePaise !== EMPTY_FILTERS.maxPricePaise ? sheetFilters.maxPricePaise : undefined,
      verificationBadges:  sheetFilters.verificationBadges.length ? sheetFilters.verificationBadges : undefined,
    };

    listAstrologers(apiFilters, effectiveSort)
      .then((rows) => { if (!cancelled) setResults(rows); })
      .catch(() => { /* client already fell back to mock */ })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefetching(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, specialization, sort, sheetFilters]);

  /* Apply the name-search filter every render. Cheap substring match on
   * ~50 rows max — no need to memoise. */
  const visibleResults = applyNameSearch(results);

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
          {/* Pandits escape hatch — Hindu users are auto-routed here from
              /priests, so give them a one-tap way back to the Pandits
              marketplace. `?view=pandit` bypasses the auto-redirect in
              FaithDetailPage so we don't ping-pong. */}
          <Link
            href="/priests?view=pandit"
            style={{
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 999,
              background: 'transparent',
              border: `1.5px solid ${NAVY}`,
              color: NAVY,
              fontSize: 12.5,
              fontWeight: 800,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Pandits
          </Link>
          {/* Wallet balance chip — tap-to-topup shortcut so users don't
              have to hunt for the wallet button when they realise they're
              short on funds mid-browse. */}
          <WalletBadge />
        </div>

        {/* Search + Topic chip row (AstroTalk-style pinned scroller).
         * Search does client-side name matching over the fetched list.
         * Topic chips single-select — tapping one narrows to that topic;
         * "All" clears the topic filter. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 12, overflowX: 'auto', paddingBottom: 2,
        }}>
          {/* Search input */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#FFFFFF', border: `1px solid ${nameQuery ? GOLD : 'rgba(15,36,82,0.15)'}`,
            borderRadius: 999, padding: '2px 4px 2px 4px',
            flexShrink: 0, minWidth: 210,
          }}>
            <span style={{
              width: 30, height: 30, borderRadius: 999,
              background: GOLD_L, color: NAVY,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Search name…"
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                padding: '8px 10px', fontSize: 13, color: NAVY,
                flex: 1, minWidth: 0,
              }}
            />
            {nameQuery && (
              <button
                type="button"
                onClick={() => setNameQuery('')}
                aria-label="Clear search"
                style={{
                  background: 'transparent', border: 'none', color: '#94a3b8',
                  fontSize: 16, cursor: 'pointer', padding: '0 8px',
                }}
              >×</button>
            )}
          </div>

          {/* Vertical divider */}
          <div style={{ width: 1, height: 24, background: 'rgba(15,36,82,0.15)', flexShrink: 0 }} />

          {/* Topic chips */}
          {TOPIC_CHIPS.map((t) => {
            const active = topic === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTopicChip(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 999,
                  background: active ? `${GOLD_L}30` : '#FFFFFF',
                  border: `1.5px solid ${active ? GOLD : 'rgba(15,36,82,0.12)'}`,
                  color: NAVY, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                <span aria-hidden style={{ color: t.color, fontSize: 14, display: 'inline-flex' }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Quick filter row: All / Online Now / Top Rated / Filters(sheet) */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip active={quickFilter === 'all'}    onClick={() => setQuickFilter('all')}>All</Chip>
          <Chip active={quickFilter === 'online'} onClick={() => setQuickFilter('online')}>● Online Now</Chip>
          <Chip active={quickFilter === 'top'}    onClick={() => setQuickFilter('top')}>★ Top Rated</Chip>
          <FiltersButton
            count={activeFilterCount}
            onClick={() => setSheetOpen(true)}
          />
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
        <span>{visibleResults.length} astrologer{visibleResults.length !== 1 && 's'} available</span>
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
      {loading && visibleResults.length === 0 && (
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
        {!loading && visibleResults.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: TEXT2, fontSize: 14,
          }}>
            {nameQuery
              ? `No astrologers match "${nameQuery}". Try a different name.`
              : 'No astrologers match your filters. Try widening them.'}
          </div>
        ) : (
          visibleResults.map((a) => <BrowseCard key={a.id} a={a} />)
        )}
      </div>

      {/* Bottom-sheet filter modal — mounted at page root so it overlays
       *  everything (including the sticky header). */}
      <FiltersSheet
        open={sheetOpen}
        value={sheetFilters}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => { setSheetFilters(next); setSheetOpen(false); }}
      />
    </div>
  );
}

/** "Filters" pill with a filter-lines icon and a circular badge showing the
 *  active-filter count. Sits at the end of the top quick-filter row. */
function FiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
  const active = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px',
        background: active
          ? `linear-gradient(135deg,${GOLD_L},${GOLD})`
          : '#FFFFFF',
        color: NAVY,
        border: `1px solid ${active ? GOLD : 'rgba(15,36,82,0.15)'}`,
        borderRadius: 999,
        fontSize: 12.5, fontWeight: 700,
        whiteSpace: 'nowrap', flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {/* Two-line filter icon (SVG so it scales cleanly at any DPI) */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 6h16M7 12h10M10 18h4" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      Filters
      {count > 0 && (
        <span
          aria-label={`${count} active`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 999,
            background: NAVY, color: CREAM,
            fontSize: 10.5, fontWeight: 800, lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
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

