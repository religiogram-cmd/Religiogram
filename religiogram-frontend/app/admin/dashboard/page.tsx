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
import {
  adminKpis,
  adminAnalyticsApi,
  type AdminKpis,
  type AdminRevenue,
  type AdminBookingTrend,
  type AdminDisputeSla,
} from '@/lib/admin-api';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminKpis | null>(null);
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [trend, setTrend] = useState<AdminBookingTrend | null>(null);
  const [sla, setSla] = useState<AdminDisputeSla | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    setWidgetsLoading(true);
    try {
      const [kpisResp, revenueResp, trendResp, slaResp] = await Promise.allSettled([
        adminKpis(),
        adminAnalyticsApi.revenue(),
        adminAnalyticsApi.bookingTrend(),
        adminAnalyticsApi.disputeSla(),
      ]);

      if (kpisResp.status === 'fulfilled') {
        setData(kpisResp.value);
      } else {
        setErr(
          (kpisResp.reason as any)?.message ?? 'Failed to load dashboard',
        );
      }
      setRevenue(revenueResp.status === 'fulfilled' ? revenueResp.value : null);
      setTrend(trendResp.status === 'fulfilled' ? trendResp.value : null);
      setSla(slaResp.status === 'fulfilled' ? slaResp.value : null);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setWidgetsLoading(false);
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

          {/* Revenue + SLA row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RevenueCard revenue={revenue} loading={widgetsLoading} />
            <BookingsCard bookings={data.bookings} />
            <SlaCard sla={sla} loading={widgetsLoading} />
          </div>

          {/* Booking trend chart */}
          <BookingTrendCard trend={trend} loading={widgetsLoading} />

          {/* Secondary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiTile label="Suspended Users" value={data.users.suspended} tone="amber" />
            <KpiTile label="Banned Users"    value={data.users.banned}    tone="red" />
            <KpiTile label="Open Disputes"   value={data.disputes.open}   tone="red" href="/admin/disputes" />
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
              <QuickAction href="/admin/disputes"       label="Disputes" />
              <QuickAction href="/admin/wallet"         label="Wallet" />
              <QuickAction href="/admin/audit-log"      label="Audit log" />
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

/* ─────── Revenue / Trend / SLA widgets ─────── */

function rupees(paise: number): string {
  const abs = Math.abs(paise);
  if (abs >= 10_000_000) return `₹${(paise / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000)    return `₹${(paise / 100_000).toFixed(2)} L`;
  if (abs >= 1_000)      return `₹${(paise / 100).toFixed(0)}`;
  return `₹${(paise / 100).toFixed(2)}`;
}

function RevenueCard({ revenue, loading }: { revenue: AdminRevenue | null; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Revenue (last 30 days)
      </h2>
      {loading && !revenue ? (
        <div className="mt-3 h-16 flex items-center">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
        </div>
      ) : revenue ? (
        <>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {rupees(revenue.credits)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-slate-500">Credits</div>
              <div className="text-emerald-700 font-semibold">{rupees(revenue.credits)}</div>
            </div>
            <div>
              <div className="text-slate-500">Debits</div>
              <div className="text-rose-700 font-semibold">{rupees(revenue.debits)}</div>
            </div>
            <div>
              <div className="text-slate-500">Holds</div>
              <div className="text-slate-700 font-semibold">{rupees(revenue.holds)}</div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Revenue data unavailable.</p>
      )}
    </section>
  );
}

function BookingsCard({ bookings }: { bookings: { total: number; completed: number; cancelled: number } }) {
  const completionRate = bookings.total > 0
    ? Math.round((bookings.completed / bookings.total) * 100)
    : 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Bookings
      </h2>
      <div className="mt-2 text-3xl font-bold text-slate-900">
        {bookings.total.toLocaleString()}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-500">Completed</div>
          <div className="text-emerald-700 font-semibold">{bookings.completed.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-slate-500">Cancelled</div>
          <div className="text-rose-700 font-semibold">{bookings.cancelled.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-slate-500">Rate</div>
          <div className="text-slate-800 font-semibold">{completionRate}%</div>
        </div>
      </div>
    </section>
  );
}

function SlaCard({ sla, loading }: { sla: AdminDisputeSla | null; loading: boolean }) {
  const health = sla?.healthPct ?? 100;
  const healthTone =
    health >= 90 ? 'text-emerald-600'
    : health >= 70 ? 'text-amber-600'
    : 'text-red-600';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Dispute SLA
      </h2>
      {loading && !sla ? (
        <div className="mt-3 h-16 flex items-center">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
        </div>
      ) : sla ? (
        <>
          <div className={`mt-2 text-3xl font-bold ${healthTone}`}>{health}%</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-500">Open</div>
              <div className="text-slate-800 font-semibold">{sla.open.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-slate-500">Overdue</div>
              <div className={`font-semibold ${sla.overdue > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {sla.overdue.toLocaleString()}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">SLA data unavailable.</p>
      )}
    </section>
  );
}

function BookingTrendCard({ trend, loading }: { trend: AdminBookingTrend | null; loading: boolean }) {
  // Aggregate rows into totals per day.
  const daily: Array<{ day: string; total: number; completed: number; cancelled: number }> = [];
  if (trend?.rows) {
    const map = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const r of trend.rows) {
      const key = r.day.slice(0, 10);
      const cur = map.get(key) ?? { total: 0, completed: 0, cancelled: 0 };
      const count = Number(r.count) || 0;
      cur.total += count;
      if (r.status === 'completed') cur.completed += count;
      if (r.status === 'cancelled') cur.cancelled += count;
      map.set(key, cur);
    }
    for (const [day, v] of map) daily.push({ day, ...v });
    daily.sort((a, b) => a.day.localeCompare(b.day));
  }

  const maxTotal = daily.reduce((m, d) => Math.max(m, d.total), 0) || 1;
  const width = 640;
  const height = 140;
  const pad = 20;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const stepX = daily.length > 1 ? innerW / (daily.length - 1) : 0;
  const points = daily.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + innerH - (d.total / maxTotal) * innerH;
    return { x, y };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area =
    points.length > 0
      ? `${path} L${points[points.length - 1].x},${pad + innerH} L${points[0].x},${pad + innerH} Z`
      : '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Booking trend (30 days)
        </h2>
        <span className="text-xs text-slate-500">
          {daily.length ? `${daily.length} days · peak ${maxTotal}` : ''}
        </span>
      </div>
      {loading && !trend ? (
        <div className="mt-3 h-32 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
        </div>
      ) : daily.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No booking activity in this window.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-32"
          >
            <defs>
              <linearGradient id="rgTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#rgTrendFill)" />}
            {path && (
              <path
                d={path}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="2.5"
                fill="#0f172a"
              >
                <title>{`${daily[i].day} · ${daily[i].total} bookings`}</title>
              </circle>
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500">
            <span>{daily[0]?.day}</span>
            <span>{daily[daily.length - 1]?.day}</span>
          </div>
        </div>
      )}
    </section>
  );
}
