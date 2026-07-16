'use client';

/**
 * /admin/wallet — Wallet Ops + Refunds console.
 *
 * Wallet Ops: search a user (email/phone), inspect their wallet + ledger,
 * manually credit their wallet with a justification.
 *
 * Refunds: look up a captured payment by reference id (bookingId) and issue
 * a force-refund to the target user's wallet (calls AdminWalletController's
 * /force-refund; there is no dedicated /admin/payments/refund yet, so this
 * is the money-in-the-wallet lever we have).
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  adminWalletApi,
  type AdminLedgerRow,
  type AdminUserRow,
  type AdminWalletSummary,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

type TabId = 'ops' | 'refunds';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ops', label: 'Wallet Ops' },
  { id: 'refunds', label: 'Refunds' },
];

function rupees(paise?: number | null): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return '—';
  return `₹${(paise / 100).toFixed(2)}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString();
}

export default function AdminWalletPage() {
  const [tab, setTab] = useState<TabId>('ops');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Wallet</h1>
        <p className="text-sm text-slate-500 mt-1">
          Inspect user wallets, issue manual credits, and process refunds.
        </p>
      </div>

      <div className="flex gap-2">
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

      {tab === 'ops' ? <WalletOps /> : <Refunds />}
    </div>
  );
}

/* ─────────────────────────  Wallet Ops tab  ─────────────────────────── */

function WalletOps() {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [wallet, setWallet] = useState<AdminWalletSummary | null>(null);
  const [ledger, setLedger] = useState<AdminLedgerRow[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditRupees, setCreditRupees] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditSubmitting, setCreditSubmitting] = useState(false);

  const search = useCallback(async () => {
    if (q.trim().length < 3) {
      showToast('Enter at least 3 characters to search', 'error');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await adminWalletApi.findUser(q.trim());
      setMatches(res.items ?? []);
      if ((res.items ?? []).length === 0) {
        showToast('No users match that search', 'error');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }, [q]);

  const loadWallet = useCallback(async (user: AdminUserRow) => {
    setSelected(user);
    setWallet(null);
    setLedger([]);
    setLoadingWallet(true);
    setError(null);
    try {
      const [walletRes, ledgerRes] = await Promise.all([
        adminWalletApi.get(user.id),
        adminWalletApi.ledger(user.id, { limit: 50 }).catch(() => ({ data: [], total: 0 })),
      ]);
      setWallet(walletRes);
      setLedger(ledgerRes.data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load wallet.');
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (selected) loadWallet(selected);
  }, [selected, loadWallet]);

  const submitCredit = useCallback(async () => {
    if (!selected) return;
    const rupeesNum = parseFloat(creditRupees);
    if (!Number.isFinite(rupeesNum) || rupeesNum <= 0) {
      showToast('Enter a positive amount', 'error');
      return;
    }
    if (creditReason.trim().length < 4) {
      showToast('Reason must be at least 4 characters', 'error');
      return;
    }
    setCreditSubmitting(true);
    try {
      await adminWalletApi.credit(selected.id, {
        amountPaise: Math.round(rupeesNum * 100),
        justification: creditReason.trim(),
        idempotencyKey: `admin-ui:${selected.id}:${Date.now()}`,
      });
      showToast('Credit posted', 'success');
      setCreditOpen(false);
      setCreditRupees('');
      setCreditReason('');
      await loadWallet(selected);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Credit failed.';
      showToast(msg, 'error');
    } finally {
      setCreditSubmitting(false);
    }
  }, [selected, creditRupees, creditReason, loadWallet]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 block">
            <span className="text-xs font-medium text-slate-600">
              Search users by email or name
            </span>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="user@example.com or name"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {matches.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {matches.map((u) => (
              <li
                key={u.id}
                className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                onClick={() => loadWallet(u)}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{u.name ?? '—'}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {u.id.slice(0, 12)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {selected && (
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Selected user</p>
              <p className="text-base font-semibold text-slate-900">
                {selected.name ?? '—'}{' '}
                <span className="text-sm text-slate-500 font-normal">
                  ({selected.email})
                </span>
              </p>
              <Link
                href={`/admin/users/${selected.id}`}
                className="text-xs text-slate-500 underline"
              >
                Open user profile →
              </Link>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={refresh}
                disabled={loadingWallet}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setCreditOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Manual credit
              </button>
            </div>
          </div>

          {loadingWallet ? (
            <div className="mt-6 flex justify-center py-8">
              <div className="h-6 w-6 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
            </div>
          ) : wallet ? (
            <>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="Available" value={rupees(wallet.availableBalance)} />
                <StatBox label="Held" value={rupees((wallet as any).heldBalance)} />
                <StatBox
                  label="Status"
                  value={
                    wallet.status ? (
                      <span className="capitalize">{wallet.status}</span>
                    ) : (
                      '—'
                    )
                  }
                />
                <StatBox label="Currency" value={wallet.currency ?? 'INR'} />
              </div>

              <div className="mt-6">
                <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                  Ledger (latest 50)
                </h3>
                {ledger.length === 0 ? (
                  <p className="text-sm text-slate-500">No ledger entries.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">When</th>
                          <th className="text-left font-medium px-3 py-2">Type</th>
                          <th className="text-right font-medium px-3 py-2">Amount</th>
                          <th className="text-right font-medium px-3 py-2">Balance</th>
                          <th className="text-left font-medium px-3 py-2">Ref</th>
                          <th className="text-left font-medium px-3 py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                              {formatDate(row.createdAt)}
                            </td>
                            <td className="px-3 py-2 text-slate-700 capitalize">
                              {row.entryType}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-medium ${row.direction > 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                            >
                              {row.direction > 0 ? '+' : '-'}
                              {rupees(row.amount)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {rupees(row.balanceAfter)}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-xs">
                              <div>{row.referenceType ?? '—'}</div>
                              <div className="font-mono truncate max-w-[140px]">
                                {row.referenceId ?? '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[240px]">
                              {row.description ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      )}

      {creditOpen && selected && (
        <ConfirmModal
          title="Manual wallet credit"
          onCancel={() => (creditSubmitting ? null : setCreditOpen(false))}
          onConfirm={submitCredit}
          submitting={creditSubmitting}
          confirmLabel="Post credit"
        >
          <p className="text-sm text-slate-600 mb-3">
            Crediting <strong>{selected.email}</strong>. This creates an
            immutable ledger entry and audit-log row.
          </p>
          <label className="block mb-3">
            <span className="text-xs font-medium text-slate-700">Amount (₹)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={creditRupees}
              onChange={(e) => setCreditRupees(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Reason (audit)</span>
            <textarea
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder="e.g. Goodwill adjustment for bug XYZ"
            />
          </label>
        </ConfirmModal>
      )}
    </div>
  );
}

/* ─────────────────────────  Refunds tab  ─────────────────────────────── */

function Refunds() {
  const [ownerId, setOwnerId] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (!ownerId.trim()) {
      showToast('Owner user ID required', 'error');
      return;
    }
    if (!referenceId.trim()) {
      showToast('Reference ID required', 'error');
      return;
    }
    const amt = parseFloat(amountRupees);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a positive amount', 'error');
      return;
    }
    if (reason.trim().length < 4) {
      showToast('Reason must be at least 4 characters', 'error');
      return;
    }
    if (
      !window.confirm(
        `Refund ₹${amt.toFixed(2)} into wallet of ${ownerId} for ref ${referenceId}?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await adminWalletApi.forceRefund(ownerId.trim(), {
        amountPaise: Math.round(amt * 100),
        referenceId: referenceId.trim(),
        reason: reason.trim(),
      });
      showToast('Refund posted', 'success');
      setAmountRupees('');
      setReason('');
      setReferenceId('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Refund failed.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [ownerId, referenceId, amountRupees, reason]);

  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-slate-600 mb-4">
        Issue a force-refund into a user&apos;s wallet. Amounts are bound to a
        booking / payment reference so the operation is idempotent per
        (admin, reference, amount) — re-firing the same values is a no-op.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Target user ID (wallet owner)
          </span>
          <input
            type="text"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="uuid…"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Reference ID (booking / payment)
          </span>
          <input
            type="text"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="uuid…"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Amount (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Reason (audit)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="e.g. Duplicate charge on booking XYZ"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? 'Processing…' : 'Issue refund'}
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────  Shared bits  ─────────────────────────── */

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ConfirmModal({
  title,
  children,
  onCancel,
  onConfirm,
  submitting,
  confirmLabel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  confirmLabel: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
