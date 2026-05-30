'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCityContext as useCity } from '@/contexts/CityContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useFavorites } from '@/hooks/useFavorites';
import { templesApi, type Temple } from '@/lib/temples-api';
import { ApiError } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { CitySelectorModal } from '@/components/city/CitySelectorModal';
import { RGLogo } from '@/components/ui/RGLogo';
import { TempleList } from './TempleList';
import { TempleMap } from './TempleMap';
import { TempleSearchBar, type ResolvedPlace } from './TempleSearchBar';
import { TempleTabs, type TempleTab } from './TempleTabs';
import { RecentlyViewedStrip } from './RecentlyViewedStrip';

/**
 * Temple Discovery — the home screen after onboarding.
 *
 * Changes from v1
 * ---------------
 *   - City context: the user's saved city (from localStorage) is the
 *     fallback centre when GPS is denied. If neither is available, the
 *     CitySelectorModal opens to force a choice.
 *   - Infinite scroll on the All India tab: pages of 10, appended as
 *     the sentinel enters the viewport.
 *   - Analytics instrumentation: tab switches, city selections, and
 *     card clicks are fired through the `analytics` helper.
 */

const LAUNCH_CITIES = [
  'Delhi',
  'Mumbai',
  'Kolkata',
  'Lucknow',
  'Ahmedabad',
  'Varanasi',
] as const;

const ALL_INDIA_PAGE_SIZE = 10;

export default function TempleDiscovery() {
  const geo = useGeolocation();
  const _cityCtx = useCity() as any;
  const city = (_cityCtx?.city ?? null);
  const isHydrated: boolean = (_cityCtx?.isHydrated as boolean | undefined) ?? true;
  const setCity: (slugOrCity: any) => void = (_cityCtx?.setCity as ((slugOrCity: any) => void) | undefined) ?? (() => {});
  const { ensureHydrated: hydrateFavorites } = useFavorites();

  const [tab, setTab] = useState<TempleTab>('local');

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [showCityModal, setShowCityModal] = useState(false);

  /* ── Per-tab data. ── */
  const [localTemples, setLocalTemples] = useState<Temple[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [allTemples, setAllTemples] = useState<Temple[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allLoadingMore, setAllLoadingMore] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);
  const [allPage, setAllPage] = useState(1);
  const [allHasMore, setAllHasMore] = useState(false);

  /**
   * Retry ticks. Bumping one of these re-runs the corresponding fetch
   * effect without any other inputs changing — the cheapest way to wire
   * the "Try again" button in the list error state. One tick per tab so
   * a retry on Local doesn't reshoot the All-India query.
   */
  const [localRetryTick, setLocalRetryTick] = useState(0);
  const [allRetryTick, setAllRetryTick] = useState(0);

  const localAbortRef = useRef<AbortController | null>(null);
  const allAbortRef = useRef<AbortController | null>(null);

  /* ── Auto-switch to All-India if geo permission is denied / unavailable. ── */
  useEffect(() => {
    if (geo.status === 'denied' || geo.status === 'unavailable') {
      setTab('all');
      analytics.locationPermission(geo.status);
    }
    if (geo.status === 'granted') {
      analytics.locationPermission('granted');
    }
  }, [geo.status]);

  /* ── First-load: if geo not granted AND no saved city, open the modal. ── */
  useEffect(() => {
    if (!isHydrated) return;
    const geoAvailable = geo.status === 'granted' && !!geo.coords;
    if (!geoAvailable && !city) {
      setShowCityModal(true);
    }
  }, [isHydrated, geo.status, geo.coords, city]);

  /* ── Local tab fetch. Prefers GPS; falls back to saved city. ── */
  useEffect(() => {
    if (tab !== 'local') return;

    // Need either precise coords or a city to run.
    const hasCoords = geo.status === 'granted' && !!geo.coords;
    if (!hasCoords && !city) return;

    localAbortRef.current?.abort();
    const ctl = new AbortController();
    localAbortRef.current = ctl;

    const run = async () => {
      setLocalLoading(true);
      setLocalError(null);
      try {
        const data = await templesApi.nearby(
          hasCoords
            ? { lat: geo.coords!.lat, lng: geo.coords!.lng, radiusKm: 10, limit: 30 }
            : { city: city!.slug, radiusKm: 20, limit: 30 },
          ctl.signal,
        );
        setLocalTemples(data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setLocalError(
          err instanceof ApiError
            ? err.message
            : 'Could not load nearby temples. Please try again.',
        );
      } finally {
        if (!ctl.signal.aborted) setLocalLoading(false);
      }
    };
    run();

    return () => ctl.abort();
  }, [tab, geo.status, geo.coords, city, localRetryTick]);

  /* ── All-India tab fetch (page 1) — reruns when query or filter changes. ── */
  useEffect(() => {
    if (tab !== 'all') return;

    allAbortRef.current?.abort();
    const ctl = new AbortController();
    allAbortRef.current = ctl;

    setAllPage(1);

    const run = async () => {
      setAllLoading(true);
      setAllError(null);
      try {
        const data = await templesApi.list(
          {
            search: debouncedQuery || undefined,
            city: cityFilter ?? undefined,
            page: 1,
            limit: ALL_INDIA_PAGE_SIZE,
          },
          ctl.signal,
        );
        setAllTemples(data.items);
        setAllHasMore(data.hasMore);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setAllError(
          err instanceof ApiError
            ? err.message
            : 'Could not load temples. Please try again.',
        );
      } finally {
        if (!ctl.signal.aborted) setAllLoading(false);
      }
    };
    run();

    return () => ctl.abort();
  }, [tab, debouncedQuery, cityFilter, allRetryTick]);

  /* ── Infinite scroll handler: load next page and append. ── */
  const loadMoreAllIndia = useCallback(async () => {
    if (tab !== 'all' || !allHasMore || allLoading || allLoadingMore) return;

    const nextPage = allPage + 1;
    setAllLoadingMore(true);
    try {
      const data = await templesApi.list({
        search: debouncedQuery || undefined,
        city: cityFilter ?? undefined,
        page: nextPage,
        limit: ALL_INDIA_PAGE_SIZE,
      });
      setAllTemples((prev: any) => {
        // De-dup by id — handles the rare race where the user swaps
        // filters and an old page's promise resolves late.
        const seen = new Set(prev.map((t: any) => t.id));
        const merged = [...prev];
        for (const t of data.items) if (!seen.has(t.id)) merged.push(t);
        return merged;
      });
      setAllPage(nextPage);
      setAllHasMore(data.hasMore);
    } catch (err) {
      // Don't surface a loud error for pagination failures — user can
      // retry by scrolling up and back down.
      if ((err as Error).name === 'AbortError') return;
    } finally {
      setAllLoadingMore(false);
    }
  }, [tab, allHasMore, allLoading, allLoadingMore, allPage, debouncedQuery, cityFilter]);

  /* ── When a user picks a Google Place, pan map + clear city filter. ── */
  const handlePlaceSelected = useCallback((place: ResolvedPlace) => {
    setCameraTarget({ lat: place.lat, lng: place.lng });
    setCityFilter(null);
  }, []);

  const currentItems = tab === 'local' ? localTemples : allTemples;
  const currentLoading = tab === 'local' ? localLoading : allLoading;
  const currentError = tab === 'local' ? localError : allError;

  /**
   * Paint hearts. Whenever the visible list changes we ask the server
   * "which of these are favourited?" in one round-trip. The hook
   * internally no-ops when the id-set hasn't meaningfully changed.
   *
   * We depend on the joined-ids string rather than the array identity
   * so a re-render with the same ids (even a different array ref)
   * doesn't trigger a spurious request.
   */
  const visibleIdsKey = currentItems.map((t: any) => t.id).join(',');
  useEffect(() => {
    if (currentItems.length === 0) return;
    hydrateFavorites(currentItems.map((t: any) => t.id));
    // hydrateFavorites is stable (useCallback([])). visibleIdsKey is the
    // real invalidation signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey]);

  const mapUserLocation = useMemo(
    () => (geo.coords ? { lat: geo.coords.lat, lng: geo.coords.lng } : null),
    [geo.coords],
  );

  return (
    <div
      className="min-h-svh"
      style={{ background: '#F6F7FA' }}
    >
      {/* ── Header ── */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid rgba(15,36,82,0.08)',
        padding: '14px 20px 16px',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        {/* Brand row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <RGLogo size={34} flat />
            <span style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 17, fontWeight: 700, color: '#0F2452', letterSpacing: '-0.02em',
            }}>ReligioGram</span>
          </div>

          {/* City pill */}
          {city && (
            <button
              type="button"
              onClick={() => setShowCityModal(true)}
              aria-label="Change city"
              style={{
                display:'flex', alignItems:'center', gap:5, height:32, padding:'0 12px',
                borderRadius: 999, border: '1.5px solid rgba(15,36,82,0.14)',
                background: '#F6F7FA', cursor:'pointer',
                fontSize: 12, fontWeight: 600, color: '#0F2452',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F2452" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {city.displayName}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          )}
        </div>

        {/* Page title */}
        <div>
          <h1 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 23, fontWeight: 700, color: '#0F2452',
            letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2,
          }}>
            Discover{' '}
            <span style={{
              background: 'linear-gradient(135deg, #D4A335 0%, #C8932A 50%, #9A6F15 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              Temples
            </span>
          </h1>
          <p style={{ fontSize: 12.5, color: '#64748B', margin: '3px 0 0', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
            Verified sacred spaces across India
          </p>
        </div>
      </header>

      {/* ── Search ── */}
      <div className="px-5 mb-3">
        <TempleSearchBar
          value={query}
          onChange={setQuery}
          onDebouncedQuery={setDebouncedQuery}
          onPlaceSelected={handlePlaceSelected}
          placeholder={
            tab === 'local' ? 'Search temples near you…' : 'Search temples across India…'
          }
        />
      </div>

      {/* ── Tabs ── */}
      <div className="px-5 mb-3 flex items-center gap-3 flex-wrap">
        <TempleTabs
          active={tab}
          onChange={(next) => {
            setTab(next);
            setCameraTarget(null);
            analytics.tabSwitch(next);
          }}
          localDisabled={
            (geo.status === 'denied' || geo.status === 'unavailable') && !city
          }
        />
      </div>

      {/* ── City chips (All India tab) ── */}
      {tab === 'all' && (
        <div className="px-5 mb-3 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-2 pb-1">
            <CityChip
              label="All cities"
              active={!cityFilter}
              onClick={() => setCityFilter(null)}
            />
            {LAUNCH_CITIES.map((c) => (
              <CityChip
                key={c}
                label={c}
                active={cityFilter === c}
                onClick={() => {
                  const next = cityFilter === c ? null : c;
                  setCityFilter(next);
                  if (next) analytics.citySelected(next.toLowerCase(), 'chip');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Location status (Local tab only) ── */}
      {tab === 'local' && geo.status === 'denied' && !city && (
        <div className="mx-5 mb-3 rounded-2xl p-3 flex items-start gap-3" style={{ background: 'rgba(15,36,82,0.06)', border: '1px solid rgba(15,36,82,0.15)' }}>
          <span className="text-lg" aria-hidden>📍</span>
          <div>
            <p className="text-[12.5px] font-semibold text-[#0F2452]">Location is off</p>
            <p className="text-[11.5px] text-[#4B5563] mt-0.5 leading-relaxed">
              Pick a city so we can still show you nearby temples, or enable location from browser settings.
            </p>
            <button
              type="button"
              onClick={() => setShowCityModal(true)}
              className="mt-2 h-8 px-3 rounded-full text-[11.5px] font-semibold"
              style={{
                background: 'linear-gradient(140deg, #C8932A 0%, #B8932A 50%, #9A7B1E 100%)',
                color: '#fff',
              }}
            >
              Choose city
            </button>
          </div>
        </div>
      )}

      {/* ── Recently viewed strip (client-only, hidden when empty) ── */}
      <RecentlyViewedStrip />

      {/* ── Map ── */}
      <div className="px-5 mb-4">
        <TempleMap
          temples={currentItems}
          userLocation={mapUserLocation}
          activeId={activeId}
          onMarkerClick={(id) => {
            setActiveId(id);
            analytics.templeClick(id, 'map');
          }}
          cameraTarget={cameraTarget}
        />
      </div>

      {/* ── Results list ── */}
      <div className="px-5 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-[14px] font-semibold text-[#0F2452]"
            style={{ fontFamily: "'Inter',sans-serif" }}
          >
            {tab === 'local'
              ? geo.coords
                ? 'Nearby temples'
                : city
                ? `Temples in ${city.displayName}`
                : 'Enable location to see nearby'
              : 'All temples'}
          </h2>
          <span className="text-[11.5px] text-[#6B7280]">
            {currentItems.length > 0 ? `${currentItems.length} result${currentItems.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        <TempleList
          items={currentItems}
          loading={currentLoading}
          loadingMore={tab === 'all' && allLoadingMore}
          error={currentError}
          activeId={activeId}
          onHover={setActiveId}
          onCardClick={(id) => analytics.templeClick(id, 'list')}
          onLoadMore={tab === 'all' ? loadMoreAllIndia : undefined}
          hasMore={tab === 'all' && allHasMore}
          onRetry={() => {
            // Bump the relevant tab's retry tick — the fetch effect
            // depends on it, so this triggers a fresh request with the
            // same inputs. The abort ref ensures any half-finished
            // earlier attempt is cancelled first.
            if (tab === 'local') setLocalRetryTick((n: any) => n + 1);
            else setAllRetryTick((n: any) => n + 1);
          }}
          emptyMessage={
            tab === 'local'
              ? geo.coords || city
                ? 'No temples within this area. Try the All India tab.'
                : 'We need your location (or a city) to show nearby temples.'
              : debouncedQuery
              ? `No matches for "${debouncedQuery}".`
              : 'No temples yet in this filter.'
          }
        />
      </div>

      {/* ── City selector modal ── */}
      <CitySelectorModal
        open={showCityModal}
        onClose={() => setShowCityModal(false)}
        onSelected={(c) => {
          analytics.citySelected(c.slug, 'modal');
          // If the user is on Local but had no coords, reset to Local
          // once they pick a city — the fetch effect will run with the
          // new slug automatically.
          setTab('local');
        }}
      />
    </div>
  );
}

/* ─── Supporting UI ────────────────────────────────────────────── */
function CityChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 inline-flex items-center h-8 px-3 rounded-full text-[11.5px] font-semibold transition-all"
      style={{
        background: active ? '#0F2452' : 'rgba(255,255,255,0.85)',
        color: active ? '#fff' : '#0F2452',
        border: active ? '1px solid #0F2452' : '1px solid rgba(15,36,82,0.18)',
        boxShadow: active ? '0 2px 8px rgba(15,36,82,0.25)' : 'none',
      }}
    >
      {label}
    </button>
  );
}
