'use client';

/**
 * /admin/applications — review queue for priest applications.
 *
 * Default filter: pending_review. Operators can flip to approved, rejected,
 * or suspended to audit decisions / find a previously-handled application.
 * Each row links to /admin/applications/[id] for the full review screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminApi,
  type AdminApplicationSummary,
  type AdminApplicationStatus,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';

const FILTERS: { id: AdminApplicationStatus; label: string }[] = [
  { id: 'pending_review', label: 'Pending review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
];

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

function statusLabel(s: AdminApplicationStatus): string {
  if (s === 'pending_review') return 'Pending review';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusBadge({ status }: { status: AdminApplicationStatus }) {
  const styles =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'rejected'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : status === 'suspended'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles}`}
    >
      {statusLabel(status)}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<AdminApplicationStatus>('pending_review');
  const [items, setItems] = useState<AdminApplicationSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  // Debounce the search input — 300ms after last keystroke — so we're not
  // hammering the backend on every character while the operator types.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const fetchPage = useCallback(
    async (status: AdminApplicationStatus, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.applications.list({
          status,
          limit: PAGE_SIZE,
          offset: 0,
          q: q || undefined,
        });
        setItems(res.items ?? []);
        setTotal(typeof res.total === 'number' ? res.total : (res.items ?? []).length);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Failed to load applications.';
        setError(msg);
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await adminApi.applications.list({
        status: filter,
        limit: PAGE_SIZE,
        offset: items.length,
        q: debouncedQuery || undefined,
      });
      setItems((prev) => [...prev, ...(res.items ?? [])]);
      if (typeof res.total === 'number') setTotal(res.total);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Failed to load more results.';
      setError(msg);
    } finally {
      setLoadingMore(false);
    }
  }, [filter, items.length, debouncedQuery]);

  // Refetch whenever the filter chip OR the debounced search value changes;
  // both reset the offset to 0 by using fetchPage() directly.
  useEffect(() => {
    fetchPage(filter, debouncedQuery);
  }, [filter, debouncedQuery, fetchPage]);

  // Live updates: silently re-poll the queue every 30 s so a new
  // pending_review application submitted by a priest shows up here
  // without the admin having to hit F5. Only polls when the tab is
  // visible — we don't waste bandwidth for background tabs.
  useEffect(() => {
    let cancelled = false;

    async function silentRefresh() {
      if (document.hidden) return;
      try {
        const res = await adminApi.applications.list({
          status: filter,
          limit: PAGE_SIZE,
          offset: 0,
          q: debouncedQuery || undefined,
        });
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(typeof res.total === 'number' ? res.total : (res.items ?? []).length);
      } catch {
        // Silent — don't display a red banner for a background poll error;
        // the next successful poll will overwrite the stale state.
      }
    }

    const id = setInterval(silentRefresh, 30_000);
    // Also refresh immediately when the tab comes back into focus so the
    // admin sees fresh data as soon as they switch back.
    const onVis = () => { if (!document.hidden) silentRefresh(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [filter, debouncedQuery]);

  const displayItems = items;
  const hasMore = items.length < total;
  const q = debouncedQuery.toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Applications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review priest applications, then approve, reject, or request more
            info.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Showing {items.length.toLocaleString()} of {total.toLocaleString()}{' '}
            {filter === 'pending_review' ? 'pending review' : statusLabel(filter).toLowerCase()}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={[
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100',
                ].join(' ')}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, religion, city…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm flex items-center justify-center">
          <div className="h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-rose-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-rose-700">Could not load applications</p>
          <p className="text-sm text-slate-600 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => fetchPage(filter, debouncedQuery)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm text-center">
          <h2 className="text-base font-semibold text-slate-900">
            {q ? 'No matches for your search' : 'No applications waiting'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {q
              ? 'Try a different name, religion, or city.'
              : 'New submissions will appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Name</th>
                  <th className="text-left font-medium px-5 py-3">Religion</th>
                  <th className="text-left font-medium px-5 py-3">City</th>
                  <th className="text-left font-medium px-5 py-3">Submitted</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayItems.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {it.fullName || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-700 capitalize">
                      {it.religion || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{it.city || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {relativeTime(it.updatedAt || it.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/applications/${it.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                      >
                        Review
                        <span aria-hidden>→</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-slate-100">
            {displayItems.map((it) => (
              <li key={it.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {it.fullName || '—'}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {(it.religion || '—') + ' • ' + (it.city || '—')}
                    </p>
                  </div>
                  <StatusBadge status={it.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {relativeTime(it.updatedAt || it.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/applications/${it.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
                  >
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="border-t border-slate-100 p-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore
                  ? 'Loading…'
                  : `Load more (${(total - items.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
