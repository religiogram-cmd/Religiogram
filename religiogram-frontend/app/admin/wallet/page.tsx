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
  type AdminRefundLookup,
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

  const [freezeOpen, setFreezeOpen] = useState<null | 'freeze' | 'unfreeze'>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [freezeSubmitting, setFreezeSubmitting] = useState(false);

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

  const submitFreeze = useCallback(async () => {
    if (!selected || !freezeOpen) return;
    if (freezeReason.trim().length < 4) {
      showToast('Reason must be at least 4 characters', 'error');
      return;
    }
    setFreezeSubmitting(true);
    try {
      if (freezeOpen === 'freeze') {
        await adminWalletApi.freeze(selected.id, freezeReason.trim());
        showToast('Wallet frozen', 'success');
      } else {
        await adminWalletApi.unfreeze(selected.id, freezeReason.trim());
        showToast('Wallet unfrozen', 'success');
      }
      setFreezeOpen(null);
      setFreezeReason('');
      await loadWallet(selected);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Action failed.';
      showToast(msg, 'error');
    } finally {
      setFreezeSubmitting(false);
    }
  }, [selected, freezeOpen, freezeReason, loadWallet]);

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
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={refresh}
                disabled={loadingWallet}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh
              </button>
              {wallet && (wallet.status === 'frozen' ? (
                <button
                  type="button"
                  onClick={() => { setFreezeReason(''); setFreezeOpen('unfreeze'); }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Unfreeze
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setFreezeReason(''); setFreezeOpen('freeze'); }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                >
                  Freeze
                </button>
              ))}
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

      {freezeOpen && selected && (
        <ConfirmModal
          title={freezeOpen === 'freeze' ? 'Freeze wallet' : 'Unfreeze wallet'}
          onCancel={() => (freezeSubmitting ? null : setFreezeOpen(null))}
          onConfirm={submitFreeze}
          submitting={freezeSubmitting}
          confirmLabel={freezeOpen === 'freeze' ? 'Freeze' : 'Unfreeze'}
        >
          <p className="text-sm text-slate-600 mb-3">
            {freezeOpen === 'freeze'
              ? <>Freezing <strong>{selected.email}</strong>&apos;s wallet blocks all debits, holds and outbound transfers until an admin unfreezes it. Credits still land.</>
              : <>Unfreezing <strong>{selected.email}</strong>&apos;s wallet restores normal spend + hold behaviour.</>}
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Reason (audit, min 4 chars)</span>
            <textarea
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder="e.g. Fraud investigation — ticket #42"
            />
          </label>
        </ConfirmModal>
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
  // User search (mirrors the Wallet Ops pattern) — used to prefill / verify
  // the owner. Auto-filled from lookupRefund() if the operator only knows
  // the booking id.
  const [userQ, setUserQ] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userMatches, setUserMatches] = useState<AdminUserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<AdminWalletSummary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Booking lookup — one input, either UUID or bookingRef.
  const [refInput, setRefInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookup, setLookup] = useState<AdminRefundLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const searchUsers = useCallback(async () => {
    if (userQ.trim().length < 3) {
      showToast('Enter at least 3 characters to search', 'error');
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await adminWalletApi.findUser(userQ.trim());
      setUserMatches(res.items ?? []);
      if ((res.items ?? []).length === 0) {
        showToast('No users match that search', 'error');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Search failed.';
      showToast(msg, 'error');
    } finally {
      setSearchingUsers(false);
    }
  }, [userQ]);

  const pickUser = useCallback(async (user: AdminUserRow) => {
    setSelectedUser(user);
    setSelectedWallet(null);
    setLoadingWallet(true);
    try {
      const w = await adminWalletApi.get(user.id);
      setSelectedWallet(w);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load wallet.';
      showToast(msg, 'error');
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  const doLookup = useCallback(async () => {
    if (!refInput.trim()) {
      showToast('Enter a booking id or reference', 'error');
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    try {
      const res = await adminWalletApi.lookupRefund(refInput.trim());
      setLookup(res);
      // Auto-prefill the amount to the max refundable so the operator can
      // just hit "Issue refund" for a full refund.
      setAmountRupees(
        res.maxRefundablePaise > 0 ? (res.maxRefundablePaise / 100).toFixed(2) : '',
      );
      // If nobody's selected yet, pull the owner in as the target user so
      // ownerId autofills — otherwise trust the operator's selection.
      if (!selectedUser) {
        const pseudoUser: AdminUserRow = {
          id: res.ownerId,
          name: res.ownerName ?? null,
          email: res.ownerEmail ?? '(unknown)',
          role: 'seeker',
          accountStatus: 'active',
          isActive: true,
          isProvider: false,
          createdAt: new Date().toISOString(),
        };
        setSelectedUser(pseudoUser);
        try {
          const w = await adminWalletApi.get(res.ownerId);
          setSelectedWallet(w);
        } catch { /* non-fatal */ }
      } else if (selectedUser.id !== res.ownerId) {
        showToast(
          `Booking owner (${res.ownerEmail ?? res.ownerId.slice(0, 8)}) doesn't match selected user`,
          'error',
        );
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lookup failed.';
      setLookupError(msg);
      setLookup(null);
    } finally {
      setLookingUp(false);
    }
  }, [refInput, selectedUser]);

  const submit = useCallback(async () => {
    const ownerId = selectedUser?.id ?? lookup?.ownerId;
    const referenceId = lookup?.bookingId ?? '';
    if (!ownerId) {
      showToast('Select a user or run a booking lookup first', 'error');
      return;
    }
    if (!referenceId) {
      showToast('Run booking lookup — need the internal booking UUID', 'error');
      return;
    }
    const amt = parseFloat(amountRupees);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a positive amount', 'error');
      return;
    }
    if (lookup && amt * 100 > lookup.maxRefundablePaise) {
      showToast(
        `Amount exceeds max refundable (₹${(lookup.maxRefundablePaise / 100).toFixed(2)})`,
        'error',
      );
      return;
    }
    if (reason.trim().length < 4) {
      showToast('Reason must be at least 4 characters', 'error');
      return;
    }
    if (
      !window.confirm(
        `Refund ₹${amt.toFixed(2)} into wallet of ${selectedUser?.email ?? ownerId} for booking ${lookup?.bookingRef ?? referenceId}?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await adminWalletApi.forceRefund(ownerId, {
        amountPaise: Math.round(amt * 100),
        referenceId,
        reason: reason.trim(),
      });
      showToast('Refund posted', 'success');
      setAmountRupees('');
      setReason('');
      // Re-run lookup so the "already refunded" figure reflects reality.
      await doLookup();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Refund failed.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [selectedUser, lookup, amountRupees, reason, doLookup]);

  return (
    <div className="space-y-5">
      {/* User search */}
      <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          1. Find the target user
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 block">
            <span className="text-xs font-medium text-slate-600">Search by email or name</span>
            <input
              type="text"
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              placeholder="user@example.com or name"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <button
            type="button"
            onClick={searchUsers}
            disabled={searchingUsers}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {searchingUsers ? 'Searching…' : 'Search'}
          </button>
        </div>

        {userMatches.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {userMatches.map((u) => (
              <li
                key={u.id}
                className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                onClick={() => pickUser(u)}
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

        {selectedUser && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedUser.name ?? '—'}{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    ({selectedUser.email})
                  </span>
                </p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedUser.id}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedUser(null); setSelectedWallet(null); }}
                className="text-xs text-slate-500 underline"
              >
                Clear
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatBox
                label="Available"
                value={loadingWallet ? '…' : rupees(selectedWallet?.availableBalance)}
              />
              <StatBox
                label="Held"
                value={loadingWallet ? '…' : rupees((selectedWallet as any)?.heldBalance)}
              />
              <StatBox
                label="Wallet status"
                value={
                  loadingWallet
                    ? '…'
                    : selectedWallet?.status
                      ? <span className="capitalize">{selectedWallet.status}</span>
                      : '—'
                }
              />
            </div>
          </div>
        )}
      </section>

      {/* Booking lookup */}
      <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          2. Look up the booking
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 block">
            <span className="text-xs font-medium text-slate-600">
              Booking id or reference (e.g. RG-B-XXXXXXXX)
            </span>
            <input
              type="text"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLookup()}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder="uuid or RG-B-…"
            />
          </label>
          <button
            type="button"
            onClick={doLookup}
            disabled={lookingUp}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {lookingUp ? 'Looking up…' : 'Lookup'}
          </button>
        </div>

        {lookupError && (
          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
            {lookupError}
          </div>
        )}

        {lookup && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Captured" value={rupees(lookup.capturedPaise)} />
              <StatBox label="Already refunded" value={rupees(lookup.alreadyRefundedPaise)} />
              <StatBox label="Max refundable" value={rupees(lookup.maxRefundablePaise)} />
              <StatBox
                label="Status"
                value={<span className="capitalize">{lookup.status}</span>}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Booking <span className="font-mono">{lookup.bookingRef}</span> — payer{' '}
              <span className="font-mono">{lookup.ownerEmail ?? lookup.ownerId.slice(0, 12)}</span>
            </p>
          </div>
        )}
      </section>

      {/* Refund form */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          3. Issue the refund
        </p>
        <p className="text-sm text-slate-600 mb-4">
          Refunds are idempotent per (admin, reference, amount) — re-firing the
          same values collapses into a single ledger row.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-medium text-slate-700 block">
              Target user
            </span>
            <div className="mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
              {selectedUser
                ? <><span className="font-mono">{selectedUser.id.slice(0, 12)}</span> — {selectedUser.email}</>
                : <span className="text-slate-400">Select a user above</span>}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-700 block">
              Booking reference
            </span>
            <div className="mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700">
              {lookup
                ? <><span className="font-mono">{lookup.bookingRef}</span></>
                : <span className="text-slate-400">Run booking lookup above</span>}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Amount (₹){lookup ? ` — max ${(lookup.maxRefundablePaise / 100).toFixed(2)}` : ''}
            </span>
            <input
              type="number"
              min={0}
              max={lookup ? lookup.maxRefundablePaise / 100 : undefined}
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
            disabled={submitting || !lookup || !selectedUser}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Processing…' : 'Issue refund'}
          </button>
        </div>
      </section>
    </div>
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
