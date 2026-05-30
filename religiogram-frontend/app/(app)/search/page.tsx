'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useDebounce } from '@/hooks/useDebounce';
import { TempleCard } from '@/components/temples/TempleCard';
import { GuideCard } from '@/components/places/GuideCard';
import type { Temple } from '@/lib/temples-api';
import type { GuideCardData } from '@/components/places/GuideCard';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const RECENT_KEY = 'rg_recent_searches';
const MAX_RECENT = 5;

type Tab = 'all' | 'temples' | 'providers';

interface SearchResult {
  temples: Temple[];
  providers: GuideCardData[];
}

function getRecentSearches(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(q: string) {
  const recent = getRecentSearches().filter((r) => r !== q);
  recent.unshift(q);
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [results, setResults] = useState<SearchResult>({ temples: [], providers: [] });
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ temples: [], providers: [] });
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const { data } = await axios.get(`${API}/search`, {
        params: { q: q.trim(), limit: 20 },
      });
      setResults({
        temples: data.data?.temples ?? [],
        providers: data.data?.providers ?? [],
      });
      saveRecentSearch(q.trim());
      setRecentSearches(getRecentSearches());
    } catch {
      setResults({ temples: [], providers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  const handleRecentClick = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  };

  const removeRecent = (q: string) => {
    const updated = getRecentSearches().filter((r) => r !== q);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    setRecentSearches(updated);
  };

  const allResults = [...results.temples, ...results.providers];
  const totalCount =
    tab === 'all'
      ? allResults.length
      : tab === 'temples'
      ? results.temples.length
      : results.providers.length;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allResults.length },
    { key: 'temples', label: 'Temples', count: results.temples.length },
    { key: 'providers', label: 'Providers', count: results.providers.length },
  ];

  const showEmpty = hasSearched && !loading && totalCount === 0;
  const showIdle = !hasSearched && !loading;

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* Sticky search header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm px-4 pt-12 pb-3">
        <div className="relative mb-3">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search temples, pandits, services..."
            className="w-full pl-10 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-saffron-500/30 focus:bg-white transition-colors"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setHasSearched(false); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 text-gray-600 text-xs active:scale-90"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs — only show when there are results */}
        {hasSearched && !loading && (
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                  tab === t.key
                    ? 'bg-saffron-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] px-1 rounded-full ${
                    tab === t.key ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 pb-24">
        {/* Loading skeletons */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Idle — show recent searches */}
        {showIdle && (
          <div>
            {recentSearches.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Recent Searches
                </p>
                <div className="flex flex-col gap-1">
                  {recentSearches.map((r: any) => (
                    <div
                      key={r}
                      className="flex items-center gap-3 bg-white rounded-xl px-3 py-3 active:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <button
                        onClick={() => handleRecentClick(r)}
                        className="flex-1 text-left text-sm text-gray-700"
                      >
                        {r}
                      </button>
                      <button
                        onClick={() => removeRecent(r)}
                        className="text-gray-300 text-xs hover:text-gray-500 active:scale-90 transition"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <p className="font-cinzel font-semibold text-sacred-700 text-base mb-1">
                  Discover Sacred Services
                </p>
                <p className="text-sm text-gray-500 max-w-[240px]">
                  Search for temples, pandits, or spiritual services near you
                </p>
              </div>
            )}
          </div>
        )}

        {/* No results */}
        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🙏</div>
            <p className="font-cinzel font-semibold text-sacred-700 text-base mb-1">
              No results for &ldquo;{query}&rdquo;
            </p>
            <p className="text-sm text-gray-500 max-w-[240px]">
              Try different keywords or browse all temples and providers
            </p>
            <Link href="/home" className="mt-4 btn-saffron text-sm">
              Browse All
            </Link>
          </div>
        )}

        {/* Results */}
        {hasSearched && !loading && totalCount > 0 && (
          <div className="flex flex-col gap-3">
            {/* Temples */}
            {(tab === 'all' || tab === 'temples') && results.temples.length > 0 && (
              <div>
                {tab === 'all' && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Temples ({results.temples.length})
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {results.temples.map((temple: any) => (
                    <TempleCard key={temple.id} temple={temple} />
                  ))}
                </div>
              </div>
            )}

            {/* Providers */}
            {(tab === 'all' || tab === 'providers') && results.providers.length > 0 && (
              <div>
                {tab === 'all' && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-2">
                    Providers ({results.providers.length})
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {results.providers.map((guide: any) => (
                    <div key={guide.id} className="w-full">
                      <GuideCard guide={guide} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
