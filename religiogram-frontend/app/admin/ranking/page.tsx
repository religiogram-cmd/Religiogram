'use client';

/**
 * /admin/ranking — marketplace ranking observability + control.
 *
 * Shows the top-N providers as sorted by `ranking_score`, along with the
 * individual signals that feed the formula (rating, review count,
 * completed bookings, online status, verified, experience). Useful for
 * sanity-checking the score after a formula tweak or a bulk approval.
 *
 * The Recompute button triggers a full sweep — takes seconds today,
 * potentially minutes at 10k+ providers.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  adminRankingApi,
  type RankingRow,
} from '@/lib/specialisations-api';

const CATEGORY_LABEL: Record<string, string> = {
  priest:     'Priest',
  astrologer: 'Astrologer',
  both:       'Both',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60)      return `${Math.round(s)}s ago`;
  if (s < 3600)    return `${Math.round(s / 60)}m ago`;
  if (s < 86400)   return `${Math.round(s / 3600)}h ago`;
  if (s < 604800)  return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / 604800)}w ago`;
}

export default function AdminRankingPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const load = async () => {
    setErr(null);
    try {
      const resp = await adminRankingApi.top(limit);
      setRows(resp.items);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load ranking');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [limit]);

  const recompute = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const resp = await adminRankingApi.recomputeAll();
      setMsg(`Recomputed ${resp.updated} providers in ${resp.ms} ms.`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Recompute failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketplace ranking</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Top providers sorted by <code className="text-xs bg-slate-100 px-1 rounded">ranking_score</code>.
            Nightly cron sweeps at 03:00 UTC; use Recompute after bulk changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={200}>Top 200</option>
          </select>
          <button
            type="button"
            onClick={recompute}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-400"
          >
            {busy ? 'Recomputing…' : 'Recompute all'}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">
          No approved providers yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Cat.</th>
                <th className="px-3 py-2.5 font-medium text-right">Score</th>
                <th className="px-3 py-2.5 font-medium text-right">Rating</th>
                <th className="px-3 py-2.5 font-medium text-right">Reviews</th>
                <th className="px-3 py-2.5 font-medium text-right">Bookings</th>
                <th className="px-3 py-2.5 font-medium text-right">Exp.</th>
                <th className="px-3 py-2.5 font-medium text-center">On</th>
                <th className="px-3 py-2.5 font-medium text-center">✓</th>
                <th className="px-3 py-2.5 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {r.fullName}
                    {r.city && <span className="text-xs text-slate-500 ml-1">· {r.city}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {CATEGORY_LABEL[r.providerCategory] ?? r.providerCategory}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                    {r.rankingScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {r.ratingAvg !== null ? r.ratingAvg.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.ratingCount}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.completedBookingsCount}</td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {r.experienceYears ?? '—'}{r.experienceYears ? 'y' : ''}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.isOnline
                      ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                      : <span className="inline-block w-2 h-2 rounded-full bg-slate-300" title="Offline" />}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.isVerified ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {timeAgo(r.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          Score formula
        </summary>
        <pre className="mt-3 whitespace-pre-wrap leading-relaxed">
{`score =
  20 * (status == approved)         gatekeep
+ 10 * (isVerified)                  KYC bonus
+ 20 * profile_completeness          0..1 (name, city, bio, langs, exp, PAN, selfie)
+ 20 * (ratingAvg / 5)               rating quality
+  5 * log10(ratingCount + 1) * 3    review volume, log-scaled
+  5 * log10(completed + 1) * 5      booking history, log-scaled
+  5 * (isOnline)                    real-time boost
+  5 * exp_decay(lastActivityAt)     half-life 24h, 0 by 30d
+ 15 * min(experienceYears, 20)/20   experience bonus

# range: roughly 0..150. Recompute on rating change, booking complete,
# admin approve, and nightly at 03:00 UTC.`}
        </pre>
      </details>

      <p className="text-xs text-slate-500">
        <Link href="/admin/applications" className="underline">Applications</Link>{' · '}
        <Link href="/admin/specialisations" className="underline">Specialisations</Link>
      </p>
    </div>
  );
}
