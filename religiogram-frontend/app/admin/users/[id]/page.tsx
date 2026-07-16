'use client';

/**
 * /admin/users/[id] — user detail + recent audit trail.
 *
 * Wraps GET /admin/users/:id (single-user profile) and
 * GET /admin/audit-log?targetType=user&targetId=:id (recent moderator actions).
 * Row-level actions (suspend / ban / reactivate) reuse the same PATCH
 * /admin/users/:id/status endpoint the list page uses.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  adminAuditApi,
  adminUsersApi,
  type AdminAuditRow,
  type AdminUserDetail,
} from '@/lib/admin-api';
import { showToast } from '@/components/ui/Toast';

type ActionTarget = 'active' | 'suspended' | 'banned';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString();
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
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

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'suspended' ? 'bg-amber-100 text-amber-800 border-amber-200'
    : status === 'banned'    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900 break-words">{value || '—'}</dd>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
      {title && (
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  const [audit, setAudit] = useState<AdminAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [action, setAction] = useState<ActionTarget | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersApi.get(id);
      setUser(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load user.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await adminAuditApi.list({
        targetType: 'user',
        targetId: id,
        limit: 20,
      });
      setAudit(res.items ?? []);
    } catch {
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
    fetchAudit();
  }, [fetchUser, fetchAudit]);

  // Get current admin id so we can hide self-mutation buttons.
  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ id: string }>('/users/me', { auth: true });
        setMeId(me?.id ?? null);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const runAction = useCallback(async () => {
    if (!action || !user) return;
    if (action !== 'active' && reason.trim().length < 4) {
      showToast('Reason must be at least 4 characters', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await adminUsersApi.setStatus(user.id, {
        status: action,
        reason: reason.trim() || undefined,
      });
      showToast(
        action === 'suspended' ? 'User suspended'
        : action === 'banned'  ? 'User banned'
        :                        'User reactivated',
        'success',
      );
      setAction(null);
      setReason('');
      await Promise.all([fetchUser(), fetchAudit()]);
    } catch (err: any) {
      showToast(err?.message ?? 'Action failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [action, user, reason, fetchUser, fetchAudit]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="rounded-2xl bg-white border border-rose-200 p-6 shadow-sm">
        <p className="text-sm font-medium text-rose-700">Could not load user</p>
        <p className="text-sm text-slate-600 mt-1">{error ?? 'Unknown error'}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={fetchUser}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >Retry</button>
          <Link
            href="/admin/users"
            className="px-3 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 text-sm font-medium"
          >Back</Link>
        </div>
      </div>
    );
  }

  const isSelf = meId === user.id;

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:space-y-0">
      <div className="space-y-5">
        <div>
          <Link href="/admin/users" className="text-sm text-slate-500 hover:text-slate-700">
            ← All users
          </Link>
        </div>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 truncate">
                {user.name || user.displayName || '(no name)'}
              </h1>
              <p className="text-sm text-slate-500 mt-1 truncate">
                {user.email}{user.phone ? ` • ${user.phone}` : ''}
              </p>
              <p className="text-xs text-slate-500 mt-2 font-mono truncate">{user.id}</p>
            </div>
            <StatusBadge status={user.accountStatus} />
          </div>
        </Card>

        <Card title="Profile">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" value={user.name} />
            <Field label="Display name" value={user.displayName} />
            <Field label="First name" value={user.firstName} />
            <Field label="Last name" value={user.lastName} />
            <Field label="Email" value={user.email} />
            <Field label="Phone" value={user.phone} />
            <Field
              label="Role"
              value={<span className="capitalize">{user.role}</span>}
            />
            <Field label="Verified" value={user.isVerified ? 'Yes' : 'No'} />
            <Field label="Joined" value={formatDate(user.createdAt)} />
            <Field label="Last login" value={formatDate(user.lastLoginAt)} />
          </dl>
        </Card>

        {user.provider && (
          <Card title="Provider profile">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Provider name"
                value={user.provider.fullName ?? '—'}
              />
              <Field
                label="Category"
                value={<span className="capitalize">{user.provider.providerCategory ?? '—'}</span>}
              />
              <Field
                label="Status"
                value={<span className="capitalize">{user.provider.status}</span>}
              />
              <Field
                label="City"
                value={user.provider.city ?? '—'}
              />
              <Field
                label="Religion"
                value={<span className="capitalize">{user.provider.religion ?? '—'}</span>}
              />
              <Field
                label="Per-minute rate"
                value={
                  typeof user.provider.perMinutePaise === 'number'
                    ? `₹${(user.provider.perMinutePaise / 100).toFixed(2)}/min`
                    : '—'
                }
              />
              <Field
                label="Rating"
                value={
                  user.provider.ratingAvg !== null
                    ? `${user.provider.ratingAvg.toFixed(2)} (${user.provider.ratingCount})`
                    : '—'
                }
              />
              <Field
                label="Online"
                value={user.provider.isOnline ? 'Yes' : 'No'}
              />
              <div className="sm:col-span-2">
                <Link
                  href={`/admin/providers`}
                  className="text-xs text-slate-600 underline"
                >
                  Manage in Providers console →
                </Link>
              </div>
            </dl>
          </Card>
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start space-y-5">
        <Card title="Actions">
          <div className="flex flex-col gap-2">
            <Link
              href={`/admin/wallet`}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold text-center hover:bg-slate-800"
            >
              Open in Wallet
            </Link>
            {!isSelf && user.accountStatus === 'active' && (
              <>
                <button
                  type="button"
                  onClick={() => { setReason(''); setAction('suspended'); }}
                  className="w-full px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
                >Suspend</button>
                <button
                  type="button"
                  onClick={() => { setReason(''); setAction('banned'); }}
                  className="w-full px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
                >Ban</button>
              </>
            )}
            {!isSelf && user.accountStatus === 'suspended' && (
              <>
                <button
                  type="button"
                  onClick={() => { setReason(''); setAction('active'); }}
                  className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >Reactivate</button>
                <button
                  type="button"
                  onClick={() => { setReason(''); setAction('banned'); }}
                  className="w-full px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
                >Ban</button>
              </>
            )}
            {!isSelf && user.accountStatus === 'banned' && (
              <button
                type="button"
                onClick={() => { setReason(''); setAction('active'); }}
                className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >Reactivate</button>
            )}
            {isSelf && (
              <p className="text-xs text-slate-500">This is you — self-mutation is disabled.</p>
            )}
          </div>
        </Card>

        <Card title="Recent audit trail">
          {auditLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-slate-700 animate-spin" />
            </div>
          ) : audit.length === 0 ? (
            <p className="text-xs text-slate-500">No admin actions recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {audit.map((row) => (
                <li key={row.id} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-800 truncate">
                      {row.actionType}
                    </span>
                    <span className="text-slate-500 shrink-0">
                      {relativeTime(row.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 truncate">
                    {row.adminEmail ?? row.adminId}
                  </p>
                  {(row.notes || row.justification) && (
                    <p className="text-slate-700 mt-1 line-clamp-3">
                      {row.notes ?? row.justification}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </aside>

      {action && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => (submitting ? null : setAction(null))}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {action === 'suspended' && 'Suspend user'}
              {action === 'banned' && 'Ban user'}
              {action === 'active' && 'Reactivate user'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {user.name} <span className="text-slate-400">·</span> {user.email}
            </p>
            {action !== 'active' && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                Sessions will be killed immediately. Pending bookings tied to
                this account (as a provider or seeker) may be auto-cancelled.
              </div>
            )}
            <label className="block mt-4">
              <span className="text-xs font-medium text-slate-700">
                Reason ({action === 'active' ? 'optional' : 'required, min 4 chars'})
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="Audit log note…"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAction(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 text-sm font-medium disabled:opacity-50"
              >Cancel</button>
              <button
                type="button"
                onClick={runAction}
                disabled={submitting}
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
                  action === 'active'    ? 'bg-emerald-600 hover:bg-emerald-700'
                  : action === 'banned'  ? 'bg-rose-600 hover:bg-rose-700'
                  :                        'bg-amber-600 hover:bg-amber-700'
                }`}
              >{submitting ? 'Working…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
