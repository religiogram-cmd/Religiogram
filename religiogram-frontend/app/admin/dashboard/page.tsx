'use client';

/**
 * /admin/dashboard — top-level KPI grid + quick actions.
 *
 * Reads `GET /admin/analytics/kpis` once on mount. Loading shows a spinner;
 * failure shows a red bar with retry so the console never renders a dead
 * screen. Numbers are intentionally big + bold so the admin can eyeball
 * state at a glance from across the room.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminKpis, type AdminKpis } from '@/lib/admin-api';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const resp = await adminKpis();
      setData(resp);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Snapshot of users, providers, bookings and moderation queues.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800 flex items-center justify-between">
          <span>{err}</span>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <div
            aria-label="Loading dashboard"
            className="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin"
          />
        </div>
      ) : data ? (
        <>
          {/* Primary tiles — 6 across on wide screens */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile label="Total Users"     value={data.users.total} />
            <KpiTile label="Seekers"         value={data.users.seekers} />
            <KpiTile label="Advisors"        value={data.users.advisors} />
            <KpiTile label="Total Providers" value={data.providers.total} />
            <KpiTile label="Approved"        value={data.providers.approved} tone="emerald" />
            <KpiTile label="Pending Review"  value={data.providers.pending}  tone="amber" href="/admin/applications" />
          </div>

          {/* Secondary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiTile label="Suspended Users" value={data.users.suspended} tone="amber" />
            <KpiTile label="Banned Users"    value={data.users.banned}    tone="red" />
            <KpiTile label="Open Disputes"   value={data.disputes.open}   tone="red" />
          </div>

          {/* Providers by category */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Providers by category
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <CategoryCell label="Priest"     bucket={data.providersByCategory.priest} />
              <CategoryCell label="Astrologer" bucket={data.providersByCategory.astrologer} />
              <CategoryCell label="Both"       bucket={data.providersByCategory.both} />
            </div>
          </section>

          {/* Bookings + fraud — smaller inline stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Bookings
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Stat label="Total"     value={data.bookings.total} />
                <Stat label="Completed" value={data.bookings.completed} tone="emerald" />
                <Stat label="Cancelled" value={data.bookings.cancelled} tone="red" />
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Fraud signals
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Total"       value={data.fraud.total} />
                <Stat label="Unresolved"  value={data.fraud.unresolved} tone="red" />
              </div>
            </section>
          </div>

          {/* Quick actions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Quick actions
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <QuickAction href="/admin/applications" label="Review pending" tone="primary" />
              <QuickAction href="/admin/users"          label="Users" />
              <QuickAction href="/admin/providers"      label="Providers" />
              <QuickAction href="/admin/specialisations" label="Specialisations" />
              <QuickAction href="/admin/ranking"        label="Ranking" />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ─────────── Sub-components ─────────── */

type Tone = 'default' | 'emerald' | 'amber' | 'red';

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'emerald': return 'text-emerald-600';
    case 'amber':   return 'text-amber-600';
    case 'red':     return 'text-red-600';
    default:        return 'text-slate-900';
  }
}

function KpiTile({
  label, value, tone = 'default', href,
}: { label: string; value: number; tone?: Tone; href?: string }) {
  const inner = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClasses(tone)}`}>{value.toLocaleString()}</div>
    </div>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

function CategoryCell({ label, bucket }: { label: string; bucket: { pending: number; approved: number } }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pending</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{bucket.pending.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Approved</div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{bucket.approved.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: Tone }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClasses(tone)}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function QuickAction({ href, label, tone }: { href: string; label: string; tone?: 'primary' }) {
  const base = 'px-4 py-2 rounded-lg text-sm font-medium';
  const cls =
    tone === 'primary'
      ? `${base} bg-slate-900 text-white hover:bg-slate-800`
      : `${base} bg-slate-100 text-slate-800 hover:bg-slate-200`;
  return (
    <Link href={href} className={cls}>{label}</Link>
  );
}
