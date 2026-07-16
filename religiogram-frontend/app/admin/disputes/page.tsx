'use client';

/**
 * /admin/disputes — dispute queue + inline detail drawer.
 *
 * Wires up AdminDisputesController (list / get / assign / resolve / escalate).
 * All mutations are guarded by a confirm state and show loading / success /
 * error toasts, then refresh the list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  adminDisputesApi,
  type AdminDisputeRow,
  type DisputeStatus,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

type TabId = 'raised' | 'under_investigation' | 'resolved' | 'closed';

const TABS: { id: TabId; label: string; matches: DisputeStatus[] }[] = [
  { id: 'raised', label: 'Open', matches: ['raised'] },
  { id: 'under_investigation', label: 'Under review', matches: ['under_investigation', 'escalated'] },
  { id: 'resolved', label: 'Resolved', matches: ['resolved_for_user', 'resolved_for_provider'] },
  { id: 'closed', label: 'Closed', matches: ['closed'] },
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
  return `${d}d ago`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString();
}

function rupees(paise?: number | null): string {
  if (typeof paise !== 'number') return '—';
  return `₹${(paise / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: DisputeStatus }) {
  const styles: Record<DisputeStatus, string> = {
    raised: 'bg-amber-50 text-amber-700 border-amber-200',
    under_investigation: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    escalated: 'bg-rose-50 text-rose-700 border-rose-200',
    resolved_for_user: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    resolved_for_provider: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    closed: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function AdminDisputesPage() {
  const [tab, setTab] = useState<TabId>('raised');
  const [rows, setRows] = useState<AdminDisputeRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminDisputeRow | null>(null);

  const activeFilter = TABS.find((t) => t.id === tab)!;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Backend list only supports a single status filter. We ask for the
      // primary state of the tab and merge in the secondary state on the
      // client for tabs that group multiple states.
      const primary = activeFilter.matches[0];
      const res = await adminDisputesApi.list({ status: primary, limit: 50 });
      let items = res.data ?? [];
      if (activeFilter.matches.length > 1) {
        const results = await Promise.all(
          activeFilter.matches.slice(1).map((s) =>
            adminDisputesApi.list({ status: s, limit: 50 }).then((r) => r.data ?? []).catch(() => []),
          ),
        );
        for (const extra of results) items = [...items, ...extra];
        items.sort(
          (a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime(),
        );
      }
      setRows(items);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load disputes.');
      setRows([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await adminDisputesApi.list({
        status: activeFilter.matches[0],
        cursor,
        limit: 50,
      });
      setRows((prev) => [...prev, ...(res.data ?? [])]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, activeFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Disputes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chargebacks, refund requests and complaints — resolve, escalate, or close.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100',
              ].join(' ')}
            >
              {t.label}
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
          <p className="text-sm font-medium text-rose-700">Could not load disputes</p>
          <p className="text-sm text-slate-600 mt-1">{error}</p>
          <button
            type="button"
            onClick={fetchList}
            className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm text-center">
          <p className="text-sm text-slate-600">No disputes in this state.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Ref</th>
                  <th className="text-left font-medium px-4 py-3">Title</th>
                  <th className="text-left font-medium px-4 py-3">Type</th>
                  <th className="text-left font-medium px-4 py-3">Amount</th>
                  <th className="text-left font-medium px-4 py-3">Opened</th>
                  <th className="text-left font-medium px-4 py-3">SLA</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(d)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {d.disputeRef?.slice(0, 12) ?? d.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium truncate max-w-[220px]">
                      {d.title}
                    </td>
                    <td className="px-4 py-3 text-slate-700 capitalize">{d.referenceType}</td>
                    <td className="px-4 py-3 text-slate-700">{rupees(d.refundAmountPaise)}</td>
                    <td className="px-4 py-3 text-slate-500">{relativeTime(d.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(d.slaDeadline)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(d);
                        }}
                        className="text-xs text-slate-600 hover:text-slate-900"
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-slate-100">
            {rows.map((d) => (
              <li
                key={d.id}
                className="p-4"
                onClick={() => setSelected(d)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {d.disputeRef?.slice(0, 12) ?? d.id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mt-2 text-xs text-slate-500 flex items-center gap-3">
                  <span className="capitalize">{d.referenceType}</span>
                  <span>{rupees(d.refundAmountPaise)}</span>
                  <span>{relativeTime(d.createdAt)}</span>
                </div>
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

      {selected && (
        <DisputeDrawer
          dispute={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            setSelected(null);
            fetchList();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  Drawer  ─────────────────────────────── */

type DrawerAction = 'resolve_user' | 'resolve_provider' | 'close' | 'escalate' | null;

function DisputeDrawer({
  dispute,
  onClose,
  onRefresh,
}: {
  dispute: AdminDisputeRow;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [action, setAction] = useState<DrawerAction>(null);
  const [note, setNote] = useState('');
  const [refundRupees, setRefundRupees] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const maxRefundRupees = useMemo(
    () => (dispute.refundAmountPaise ? dispute.refundAmountPaise / 100 : null),
    [dispute],
  );

  const run = useCallback(async () => {
    if (!action) return;
    if (note.trim().length < 5) {
      showToast('Please add a resolution note', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (action === 'resolve_user') {
        const paise = refundRupees
          ? Math.round(parseFloat(refundRupees) * 100)
          : undefined;
        await adminDisputesApi.resolve(dispute.id, {
          resolution: 'resolved_for_user',
          resolutionNote: note.trim(),
          refundAmountPaise: paise,
        });
        showToast('Resolved for user', 'success');
      } else if (action === 'resolve_provider') {
        await adminDisputesApi.resolve(dispute.id, {
          resolution: 'resolved_for_provider',
          resolutionNote: note.trim(),
        });
        showToast('Resolved for provider', 'success');
      } else if (action === 'close') {
        await adminDisputesApi.resolve(dispute.id, {
          resolution: 'closed',
          resolutionNote: note.trim(),
        });
        showToast('Dispute closed', 'success');
      } else if (action === 'escalate') {
        await adminDisputesApi.escalate(dispute.id, note.trim());
        showToast('Escalated', 'success');
      }
      onRefresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Action failed.';
      showToast(msg, 'error');
      setSubmitting(false);
    }
  }, [action, note, refundRupees, dispute, onRefresh]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {dispute.title}
            </h2>
            <p className="text-xs text-slate-500 font-mono truncate">
              {dispute.disputeRef ?? dispute.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <StatusBadge status={dispute.status} />
            <span className="text-xs text-slate-500">
              opened {relativeTime(dispute.createdAt)}
            </span>
          </div>

          <section>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1">
              Description
            </p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{dispute.description}</p>
          </section>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Reference</p>
              <p className="mt-1 text-slate-800 capitalize">{dispute.referenceType}</p>
              <p className="text-xs text-slate-500 font-mono truncate">{dispute.referenceId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Refund amount</p>
              <p className="mt-1 text-slate-800">{rupees(dispute.refundAmountPaise)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Raised by</p>
              <Link
                href={`/admin/users/${dispute.raisedById}`}
                className="mt-1 block text-slate-800 hover:underline font-mono text-xs truncate"
              >
                {dispute.raisedById}
              </Link>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">SLA deadline</p>
              <p className="mt-1 text-slate-800">{formatDate(dispute.slaDeadline)}</p>
            </div>
          </div>

          {dispute.evidence && dispute.evidence.length > 0 && (
            <section>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Evidence</p>
              <ul className="space-y-2">
                {dispute.evidence.map((ev, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase text-slate-500 tracking-wide">
                        {ev.type}
                      </span>
                      {ev.url && (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-600 underline"
                        >
                          Open
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-slate-700">{ev.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dispute.resolutionNote && (
            <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-medium">
                Resolution note
              </p>
              <p className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">
                {dispute.resolutionNote}
              </p>
              {dispute.resolvedAt && (
                <p className="mt-2 text-xs text-emerald-700">
                  resolved {formatDate(dispute.resolvedAt)}
                </p>
              )}
            </section>
          )}

          {/* Actions */}
          {!['closed', 'resolved_for_user', 'resolved_for_provider'].includes(dispute.status) && (
            <section className="border-t border-slate-200 pt-5">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-3">
                Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAction('resolve_user');
                    setNote('');
                    if (maxRefundRupees) setRefundRupees(String(maxRefundRupees));
                  }}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Resolve for user
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAction('resolve_provider');
                    setNote('');
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Resolve for provider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAction('escalate');
                    setNote('');
                  }}
                  className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAction('close');
                    setNote('');
                  }}
                  className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </section>
          )}
        </div>

        {action && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900 mb-2">
              {action === 'resolve_user' && 'Resolve for user'}
              {action === 'resolve_provider' && 'Resolve for provider'}
              {action === 'escalate' && 'Escalate to L2'}
              {action === 'close' && 'Close dispute'}
            </p>
            {action === 'resolve_user' && maxRefundRupees && (
              <label className="block mb-2">
                <span className="text-xs font-medium text-slate-700">
                  Refund amount (₹) — max {maxRefundRupees.toFixed(2)}
                </span>
                <input
                  type="number"
                  min={0}
                  max={maxRefundRupees}
                  step="0.01"
                  value={refundRupees}
                  onChange={(e) => setRefundRupees(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Note (required)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="Reasoning for the audit log…"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setAction(null);
                }}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
