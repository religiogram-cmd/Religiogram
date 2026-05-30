/// <reference types="@types/google.maps" />
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDebounce } from '@/hooks/useDebounce';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { templesApi, type Temple } from '@/lib/temples-api';
import { analytics } from '@/lib/analytics';

/**
 * Search bar with three-level results:
 *
 *   1. Our own temples API (fast, free)
 *      → backs the server-side temple search, piped into the parent
 *        list via `onDebouncedQuery`.
 *
 *   2. Google Places Autocomplete (city + landmark fallback)
 *      → when the SDK is ready and returns predictions, we surface them
 *        so the user can jump the map to a neighbourhood.
 *
 *   3. Backend fallback (`/temples/search`)
 *      → shown when (a) the SDK didn't load, (b) AutocompleteService
 *        errored, or (c) Google returned zero predictions but we have
 *        direct temple matches. Keeps the UX working even when Google
 *        is down / over-quota.
 *
 * Billing discipline is unchanged: session tokens + Geocoder, never
 * Place Details.
 */

export interface ResolvedPlace {
  description: string;
  lat: number;
  lng: number;
  placeId: string;
}

export interface TempleSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (place: ResolvedPlace) => void;
  onDebouncedQuery?: (q: string) => void;
  placeholder?: string;
}

type FallbackStatus = 'idle' | 'loading' | 'ok' | 'error';

export function TempleSearchBar({
  value,
  onChange,
  onPlaceSelected,
  onDebouncedQuery,
  placeholder,
}: TempleSearchBarProps) {
  const { status, google } = useGoogleMaps();
  const debounced = useDebounce(value, 300);

  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetchingPlaces, setFetchingPlaces] = useState(false);

  /** Backend fallback matches — used when Places is unavailable / empty. */
  const [fallbackMatches, setFallbackMatches] = useState<Temple[]>([]);
  const [fallbackStatus, setFallbackStatus] = useState<FallbackStatus>('idle');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackAbortRef = useRef<AbortController | null>(null);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const autocompleteSvcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  /* ── Propagate debounced query up (for server-side temple search). ── */
  useEffect(() => {
    onDebouncedQuery?.(debounced.trim());
    if (debounced.trim().length >= 2) {
      // Source is tentative — will be re-logged as 'manual' if the
      // fallback actually produces results. This first log captures
      // what the user typed regardless of how we resolve it.
      analytics.searchQuery(debounced.trim(), 'google');
    }
  }, [debounced, onDebouncedQuery]);

  /* ── Instantiate Places + Geocoder once the SDK is ready. ── */
  useEffect(() => {
    if (status !== 'ready' || !google) return;
    if (!autocompleteSvcRef.current) {
      autocompleteSvcRef.current = new google.maps.places.AutocompleteService();
    }
    if (!geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
  }, [status, google]);

  /* ── Fetch Places predictions when we have the SDK. ── */
  useEffect(() => {
    const svc = autocompleteSvcRef.current;
    const q = debounced.trim();

    // SDK unavailable: skip Places entirely, let the fallback do the work.
    if (!svc || !google) {
      setPredictions([]);
      return;
    }
    if (q.length < 2) {
      setPredictions([]);
      return;
    }

    let cancelled = false;
    setFetchingPlaces(true);
    svc.getPlacePredictions(
      {
        input: q,
        sessionToken: sessionTokenRef.current ?? undefined,
        componentRestrictions: { country: 'in' },
        types: ['geocode'],
      },
      (res: unknown, statusCode: string) => {
        if (cancelled) return;
        setFetchingPlaces(false);
        if (
          statusCode === google.maps.places.PlacesServiceStatus.OK &&
          Array.isArray(res)
        ) {
          setPredictions(res.slice(0, 5));
        } else {
          // Either zero predictions or an error — both are cases where
          // we want the backend fallback to take over.
          setPredictions([]);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [debounced, google]);

  /* ── Backend fallback.
   *
   * Runs when:
   *   - Google returned zero Place predictions (and we've heard back),
   *     OR
   *   - The Google SDK is unavailable (status !== 'ready').
   *
   * Cancels previous in-flight via AbortController on query change.
   */
  useEffect(() => {
    const q = debounced.trim();
    const sdkReady = status === 'ready' && !!google;
    const placesExhausted = !fetchingPlaces && predictions.length === 0;
    const shouldFallback = q.length >= 2 && (!sdkReady || placesExhausted);

    if (!shouldFallback) {
      setFallbackMatches([]);
      setFallbackStatus('idle');
      return;
    }

    fallbackAbortRef.current?.abort();
    const ctl = new AbortController();
    fallbackAbortRef.current = ctl;

    const run = async () => {
      setFallbackStatus('loading');
      try {
        const results = await templesApi.search({ q, limit: 10 }, ctl.signal);
        if (ctl.signal.aborted) return;
        setFallbackMatches(results);
        setFallbackStatus(results.length === 0 ? 'idle' : 'ok');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setFallbackMatches([]);
        setFallbackStatus('error');
      }
    };
    run();

    return () => ctl.abort();
  }, [debounced, predictions.length, fetchingPlaces, status, google]);

  /* ── Close dropdown on outside click. ── */
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  /* ── Pick a Google prediction → Geocoder → parent. ── */
  const handlePick = useCallback(
    async (p: google.maps.places.AutocompletePrediction) => {
      if (!geocoderRef.current || !google) return;
      setShowDropdown(false);
      onChange(p.description);

      try {
        const { results } = await geocoderRef.current.geocode({ placeId: p.place_id });
        const first = results?.[0];
        if (!first) return;
        onPlaceSelected?.({
          description: p.description,
          placeId: p.place_id,
          lat: first.geometry.location.lat(),
          lng: first.geometry.location.lng(),
        });
      } catch {
        /* swallow — user can try another prediction */
      } finally {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
    },
    [google, onChange, onPlaceSelected],
  );

  const placeholderText = useMemo(
    () => placeholder ?? 'Search temple, city, or area…',
    [placeholder],
  );

  const hasAnyResults =
    predictions.length > 0 ||
    fallbackMatches.length > 0 ||
    fetchingPlaces ||
    fallbackStatus === 'loading';

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex items-center gap-3 px-4 h-12 rounded-2xl"
        style={{
          background: 'rgba(255,252,245,.94)',
          border: `1.5px solid ${showDropdown ? '#C8932A' : 'rgba(15,36,82,0.2)'}`,
          boxShadow: showDropdown
            ? '0 0 0 3px rgba(169,113,66,.12)'
            : '0 1px 6px rgba(107,63,29,.06)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C8932A"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholderText}
          className="flex-1 bg-transparent outline-none text-[14px] text-[#0F2452] placeholder-gray-400"
          style={{ fontFamily: "'Plus Jakarta Sans',sans-serif" }}
          aria-label="Search temples"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-navy-100"
            aria-label="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Predictions / fallback dropdown */}
      {showDropdown && hasAnyResults && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20 max-h-[70vh] overflow-y-auto"
          style={{
            background: 'rgba(255,252,245,.98)',
            border: '1px solid rgba(197,138,75,.22)',
            boxShadow: '0 12px 40px rgba(107,63,29,.18)',
          }}
        >
          {(fetchingPlaces && predictions.length === 0) ||
          (fallbackStatus === 'loading' && fallbackMatches.length === 0) ? (
            <div className="px-4 py-3 text-[12px] text-gray-500 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-blue-900/20 border-t-blue-900 rounded-full animate-spin" />
              Searching…
            </div>
          ) : null}

          {/* ── Google Places predictions (top priority) ── */}
          {predictions.map((p: any) => (
            <button
              key={p.place_id}
              type="button"
              role="option"
              onClick={() => handlePick(p)}
              className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-gray-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8932A" strokeWidth="2" strokeLinecap="round" className="mt-0.5 flex-shrink-0" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-[#0F2452] line-clamp-1">
                  {p.structured_formatting?.main_text ?? p.description}
                </span>
                {p.structured_formatting?.secondary_text && (
                  <span className="block text-[11px] text-gray-500 line-clamp-1">
                    {p.structured_formatting.secondary_text}
                  </span>
                )}
              </span>
            </button>
          ))}

          {/* ── Fallback matches (backend search) ── */}
          {fallbackMatches.length > 0 && (
            <>
              <div
                className="px-4 pt-2 pb-1 text-[10.5px] uppercase tracking-wide text-gray-500"
                style={{
                  borderTop: predictions.length ? '1px solid rgba(197,138,75,.18)' : 'none',
                }}
              >
                Temples in our catalogue
              </div>
              {fallbackMatches.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/temple/${t.id}`}
                  role="option"
                  onClick={() => {
                    setShowDropdown(false);
                    analytics.templeClick(t.id, 'list');
                  }}
                  className="block px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-start gap-3">
                    <span
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: t.isVerified ? '#1E7E45' : '#C8932A' }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-[#0F2452] line-clamp-1">
                        {t.name}
                      </span>
                      <span className="block text-[11px] text-gray-500 line-clamp-1">
                        {t.city}
                        {t.address ? ` · ${t.address}` : ''}
                      </span>
                    </span>
                  </span>
                </Link>
              ))}
            </>
          )}

          {/* Error state for fallback — only when we have nothing else. */}
          {fallbackStatus === 'error' &&
            predictions.length === 0 &&
            fallbackMatches.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-red-800/70">
                Search is temporarily unavailable. Please try again.
              </div>
            )}
        </div>
      )}
    </div>
  );
}
