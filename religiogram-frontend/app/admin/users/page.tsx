'use client';

/**
 * /admin/users — user management console.
 *
 * Search + role/status filters over the paginated users list. Row actions
 * (suspend / ban / reactivate) open a confirmation modal with a reason
 * textarea before hitting PATCH /admin/users/:id/status.
 *
 * Self-actions are hidden — we fetch `/users/me` on mount and match by id
 * so an admin can't accidentally lock themselves out from this console.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  adminUsersApi,
  type AdminUserRow,
  type AccountStatus,
  type UserRole,
} from '@/lib/admin-api';

const ROLE_LABEL: Record<UserRole, string> = {
  seeker:  'Seeker',
  advisor: 'Advisor',
  admin:   'Admin',
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  active:               'Active',
  suspended:            'Suspended',
  banned:               'Banned',
  pending_verification: 'Pending verification',
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60)      return `${Math.round(s)}s ago`;
  if (s < 3600)    return `${Math.round(s / 60)}m ago`;
  if (s < 86400)   return `${Math.round(s / 3600)}h ago`;
  if (s < 604800)  return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / 604800)}w ago`;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');

  const [meId, setMeId] = useState<string | null>(null);
  /* Row-level action targets can only be the three mutable statuses the
   * backend PATCH accepts — `pending_verification` isn't a state we let
   * admins move users into from this console. */
  const [action, setAction] = useState<{ user: AdminUserRow; target: 'active' | 'suspended' | 'banned' } | null>(null);

  // Debounce search — 300ms after the user stops typing.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [q]);

  // Fetch current admin id so we can hide self-mutation buttons.
  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ id: string }>('/users/me', { auth: true });
        setMeId(me?.id ?? null);
      } catch { /* non-fatal — worst case admin sees the buttons on their row */ }
    })();
  }, []);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const resp = await adminUsersApi.list({
        role: role || undefined,
        status: status || undefined,
        q: debouncedQ || undefined,
        limit: 50,
      });
      setRows(resp.items);
      setNextCursor(resp.nextCursor);
      setHasMore(resp.hasMore);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debouncedQ, role, status]);

  const loadMore = async () => {
    if (!hasMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const resp = await adminUsersApi.list({
        role: role || undefined,
        status: status || undefined,
        q: debouncedQ || undefined,
        cursor: nextCursor,
        limit: 50,
      });
      setRows((cur) => [...cur, ...resp.items]);
      setNextCursor(resp.nextCursor);
      setHasMore(resp.hasMore);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const applyAction = async (reason: string) => {
    if (!action) return;
    await adminUsersApi.setStatus(action.user.id, { status: action.target, reason: reason || undefined });
    setAction(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Search, filter and moderate the user base.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole | '')}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">All roles</option>
          <option value="seeker">Seeker</option>
          <option value="advisor">Advisor</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AccountStatus | '')}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">
          No users match your filters.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-center">Provider</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === meId}
                    onAction={(target) => setAction({ user: u, target })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <p className="text-xs text-slate-500">
        <Link href="/admin/dashboard" className="underline">Back to dashboard</Link>
      </p>

      {action && (
        <ConfirmActionModal
          title={
            action.target === 'suspended' ? 'Suspend user'
            : action.target === 'banned'  ? 'Ban user'
            : 'Reactivate user'
          }
          user={action.user}
          target={action.target}
          onCancel={() => setAction(null)}
          onConfirm={applyAction}
        />
      )}
    </div>
  );
}

/* ─────────── Row ─────────── */

function UserRow({
  user, isSelf, onAction,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  onAction: (target: 'active' | 'suspended' | 'banned') => void;
}) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/40">
      <td className="px-4 py-2.5 font-medium text-slate-900">
        {user.name || '—'}
        {isSelf && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">you</span>}
      </td>
      <td className="px-4 py-2.5 text-slate-600">{user.email || '—'}</td>
      <td className="px-4 py-2.5">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={user.accountStatus} />
      </td>
      <td className="px-4 py-2.5 text-center">
        {user.isProvider ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{timeAgo(user.createdAt)}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex gap-1.5">
          {isSelf ? (
            <span className="text-xs text-slate-400">—</span>
          ) : (
            <>
              {user.accountStatus === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={() => onAction('suspended')}
                    className="text-xs px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800"
                  >Suspend</button>
                  <button
                    type="button"
                    onClick={() => onAction('banned')}
                    className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                  >Ban</button>
                </>
              )}
              {user.accountStatus === 'suspended' && (
                <>
                  <button
                    type="button"
                    onClick={() => onAction('active')}
                    className="text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                  >Reactivate</button>
                  <button
                    type="button"
                    onClick={() => onAction('banned')}
                    className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                  >Ban</button>
                </>
              )}
              {user.accountStatus === 'banned' && (
                <button
                  type="button"
                  onClick={() => onAction('active')}
                  className="text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                >Reactivate</button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─────────── Badges + modal ─────────── */

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium">
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const cls =
    status === 'active'    ? 'bg-emerald-100 text-emerald-800'
  : status === 'suspended' ? 'bg-amber-100 text-amber-800'
  :                          'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ConfirmActionModal({
  title, user, target, onCancel, onConfirm,
}: {
  title: string;
  user: AdminUserRow;
  target: 'active' | 'suspended' | 'banned';
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(reason);
    } catch (e: any) {
      setErr(e?.message ?? 'Action failed');
      setBusy(false);
    }
  };

  const btnCls =
    target === 'banned'  ? 'bg-red-600 hover:bg-red-700'
  : target === 'active'  ? 'bg-emerald-600 hover:bg-emerald-700'
  :                        'bg-amber-600 hover:bg-amber-700';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {user.name} <span className="text-slate-400">·</span> {user.email || 'no email'}
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-600 block mb-1.5">
              Reason (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Internal note logged with this action."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </label>
          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200"
          >Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${btnCls} disabled:bg-slate-400`}
          >{busy ? 'Saving…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
