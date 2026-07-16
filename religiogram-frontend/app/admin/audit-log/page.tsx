'use client';

/**
 * /admin/audit-log — read-only viewer over admin_action_logs.
 *
 * Every admin mutation writes a row (via AdminAuditService or the legacy
 * payload_json log). This page filters by target type / target id / admin /
 * action type / date range and pages with a keyset cursor.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminAuditApi,
  type AdminAuditRow,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';

const TARGET_TYPES = [
  { id: '', label: 'All' },
  { id: 'provider', label: 'Provider' },
  { id: 'user', label: 'User' },
  { id: 'dispute', label: 'Dispute' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'temple', label: 'Temple' },
  { id: 'booking', label: 'Booking' },
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

function actionBadge(a: string): string {
  if (a.startsWith('provider.approve') || a.endsWith('.active')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (a.startsWith('provider.reject') || a.startsWith('provider.block')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (a.startsWith('provider.suspend') || a.startsWith('user.status.suspended') || a.startsWith('user.status.banned') || a.startsWith('wallet.freeze')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (a.startsWith('dispute.')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (a.startsWith('wallet.')) return 'bg-slate-100 text-slate-800 border-slate-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetType, setTargetType] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [actionType, setActionType] = useState<string>('');
  const [adminId, setAdminId] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAuditApi.list({
        targetType: targetType || undefined,
        targetId: targetId.trim() || undefined,
        actionType: actionType.trim() || undefined,
        adminId: adminId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 50,
      });
      setRows(res.items ?? []);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit log.');
      setRows([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, actionType, adminId, from, to]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await adminAuditApi.list({
        targetType: targetType || undefined,
        targetId: targetId.trim() || undefined,
        actionType: actionType.trim() || undefined,
        adminId: adminId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        cursor,
        limit: 50,
      });
      setRows((prev) => [...prev, ...(res.items ?? [])]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, targetType, targetId, actionType, adminId, from, to]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every admin mutation is recorded here — approvals, suspensions,
          refunds, dispute resolutions. Read-only.
        </p>
      </div>

      <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Target type</span>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.id || 'all'} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Target ID</span>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="uuid…"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Action type</span>
            <input
              type="text"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              placeholder="e.g. provider.suspend"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Admin ID</span>
            <input
              type="text"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="uuid…"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTargetType('');
              setTargetId('');
              setActionType('');
              setAdminId('');
              setFrom('');
              setTo('');
            }}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={fetchFirstPage}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm flex items-center justify-center">
          <div className="h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-rose-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-rose-700">Could not load audit log</p>
          <p className="text-sm text-slate-600 mt-1">{error}</p>
          <button
            type="button"
            onClick={fetchFirstPage}
            className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm text-center">
          <p className="text-sm text-slate-600">No audit entries match the filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">When</th>
                  <th className="text-left font-medium px-4 py-3">Admin</th>
                  <th className="text-left font-medium px-4 py-3">Action</th>
                  <th className="text-left font-medium px-4 py-3">Target</th>
                  <th className="text-left font-medium px-4 py-3">Notes</th>
                  <th className="text-left font-medium px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded[r.id];
                  return (
                    <>
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          <div>{relativeTime(r.createdAt)}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(r.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium text-slate-800 truncate max-w-[200px]">
                            {r.adminEmail ?? '—'}
                          </div>
                          <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
                            {r.adminId ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${actionBadge(r.actionType)}`}>
                            {r.actionType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="text-xs uppercase tracking-wide text-slate-500">{r.targetType}</div>
                          <div className="font-mono text-xs truncate max-w-[220px]">{r.targetId}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[320px]">
                          <div className="line-clamp-2">{r.notes ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                            }
                            className="text-xs text-slate-600 hover:text-slate-900"
                          >
                            {open ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${r.id}-detail`} className="border-t border-slate-100 bg-slate-50">
                          <td colSpan={6} className="px-4 py-4">
                            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all">
{JSON.stringify(
  {
    justification: r.justification,
    notes: r.notes,
    beforeState: r.beforeState,
    afterState: r.afterState,
    payloadJson: r.payloadJson,
    ipAddress: r.ipAddress,
  },
  null,
  2,
)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${actionBadge(r.actionType)}`}>
                    {r.actionType}
                  </span>
                  <span className="text-xs text-slate-500">{relativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {r.adminEmail ?? '—'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  <span className="uppercase tracking-wide">{r.targetType}</span>{' '}
                  · <span className="font-mono">{r.targetId?.slice(0, 12)}</span>
                </div>
                {r.notes && (
                  <p className="mt-2 text-sm text-slate-700 line-clamp-3">
                    {r.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {cursor && (
            <div className="border-t border-slate-100 p-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
