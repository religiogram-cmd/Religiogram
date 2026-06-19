'use client';

/**
 * /admin/applications — review queue for priest applications.
 *
 * Default filter: pending_review. Operators can flip to approved, rejected,
 * or suspended to audit decisions / find a previously-handled application.
 * Each row links to /admin/applications/[id] for the full review screen.
 */

import { useCallback, useEffect, useState } from 'react';
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

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<AdminApplicationStatus>('pending_review');
  const [items, setItems] = useState<AdminApplicationSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (status: AdminApplicationStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.applications.list({ status, limit: 50, offset: 0 });
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
  }, []);

  useEffect(() => {
    fetchPage(filter);
  }, [filter, fetchPage]);

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
            {total} {filter === 'pending_review' ? 'pending review' : statusLabel(filter).toLowerCase()}
          </span>
        </div>
      </div>

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
            onClick={() => fetchPage(filter)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm text-center">
          <h2 className="text-base font-semibold text-slate-900">
            No applications waiting
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            New submissions will appear here automatically.
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
                {items.map((it) => (
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
            {items.map((it) => (
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
        </div>
      )}
    </div>
  );
}
