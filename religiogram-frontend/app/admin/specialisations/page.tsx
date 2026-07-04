'use client';

/**
 * /admin/specialisations — CRUD for the specialisation master table.
 *
 * Admin can:
 *   • Filter by category
 *   • Create a new specialisation (slug, name, category, sort, flags)
 *   • Rename / recategorise / update sort order
 *   • Toggle Active / Trending / Premium-only flags inline
 *   • Move rows up/down in sort order within their category
 *   • See how many approved providers reference each spec
 *   • Hard-delete a row (with confirmation)
 *
 * The wizard picker (Step 3 of the astrologer flow) reads a filtered view
 * of the same data via `GET /v1/specialisations`. Any change here shows
 * up on the wizard within the edge-cache TTL (5 min).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  adminSpecialisationsApi,
  type SpecAdminRow,
} from '@/lib/specialisations-api';

/* Category labels — mirror the wizard's CATEGORY_META so admin sees the
 * same names devotees will see on their picker. */
const CATEGORY_LABEL: Record<string, string> = {
  astrology:   'Astrology Systems',
  divination:  'Divination & Reading',
  healing:     'Healing',
  home_energy: 'Home & Energy',
  spiritual:   'Spiritual Guidance',
};

export default function AdminSpecialisationsPage() {
  const [rows, setRows] = useState<SpecAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SpecAdminRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SpecAdminRow | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});

  const reload = async () => {
    setErr(null);
    try {
      const resp = await adminSpecialisationsApi.listAll(categoryFilter || undefined);
      setRows(resp.items);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load specialisations');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category));
    return Array.from(set).sort();
  }, [rows]);

  const grouped = useMemo(() => {
    const g: Record<string, SpecAdminRow[]> = {};
    for (const r of rows) {
      if (!g[r.category]) g[r.category] = [];
      g[r.category]!.push(r);
    }
    for (const k of Object.keys(g)) g[k]!.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return g;
  }, [rows]);

  /* Inline toggles use optimistic UI — flip locally, PATCH, revert on error. */
  const toggle = async (id: string, patch: Partial<SpecAdminRow>) => {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const updated = await adminSpecialisationsApi.update(id, patch);
      setRows((cur) => cur.map((r) => (r.id === id ? updated : r)));
    } catch (e: any) {
      setErr(e?.message ?? 'Update failed');
      reload();
    }
  };

  const move = async (r: SpecAdminRow, dir: -1 | 1) => {
    const list = grouped[r.category] ?? [];
    const idx = list.findIndex((x) => x.id === r.id);
    const swap = list[idx + dir];
    if (!swap) return;
    const items = [
      { id: r.id,    sortOrder: swap.sortOrder },
      { id: swap.id, sortOrder: r.sortOrder },
    ];
    try {
      await adminSpecialisationsApi.reorder(items);
      reload();
    } catch (e: any) {
      setErr(e?.message ?? 'Reorder failed');
    }
  };

  const loadUsage = async (r: SpecAdminRow) => {
    if (usageMap[r.id] !== undefined) return;
    try {
      const u = await adminSpecialisationsApi.usage(r.id);
      setUsageMap((cur) => ({ ...cur, [r.id]: u.providers }));
    } catch { /* ignore */ }
  };

  const del = async () => {
    if (!confirmDelete) return;
    try {
      await adminSpecialisationsApi.remove(confirmDelete.id);
      setConfirmDelete(null);
      reload();
    } catch (e: any) {
      setErr(e?.message ?? 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Specialisations</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Master catalogue used by astrologer onboarding + marketplace filters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">All categories</option>
            {Object.keys(CATEGORY_LABEL).map((k) => (
              <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>
            ))}
            {categories.filter((c) => !CATEGORY_LABEL[c]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            + New specialisation
          </button>
        </div>
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
          No specialisations yet. Click <b>+ New</b> to add one.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <section key={cat} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  {CATEGORY_LABEL[cat] ?? cat} <span className="text-slate-500 font-normal">· {list.length}</span>
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500 bg-slate-50/50">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">Order</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Slug</th>
                    <th className="px-4 py-2 font-medium text-center">Active</th>
                    <th className="px-4 py-2 font-medium text-center">Trending</th>
                    <th className="px-4 py-2 font-medium text-center">Premium</th>
                    <th className="px-4 py-2 font-medium text-right">Usage</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => move(r, -1)}
                            disabled={i === 0}
                            className="w-6 h-6 rounded border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-100"
                            aria-label="Move up"
                          >↑</button>
                          <button
                            type="button"
                            onClick={() => move(r, 1)}
                            disabled={i === list.length - 1}
                            className="w-6 h-6 rounded border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-100"
                            aria-label="Move down"
                          >↓</button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.slug}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Toggle on={r.isActive} onChange={(v) => toggle(r.id, { isActive: v })} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Toggle on={r.isTrending} onChange={(v) => toggle(r.id, { isTrending: v })} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Toggle on={r.isPremiumOnly} onChange={(v) => toggle(r.id, { isPremiumOnly: v })} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {usageMap[r.id] !== undefined ? (
                          <span className="text-slate-700">{usageMap[r.id]}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => loadUsage(r)}
                            className="text-xs text-slate-500 underline hover:text-slate-900"
                          >
                            check
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >Edit</button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(r)}
                            className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700"
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Changes propagate to the wizard picker within ~5 minutes (public
        endpoint cache).{' '}
        <Link href="/admin/applications" className="underline">Back to Applications</Link>
      </p>

      {/* Modals */}
      {createOpen && (
        <SpecFormModal
          title="New specialisation"
          onSubmit={async (body) => {
            await adminSpecialisationsApi.create(body);
            setCreateOpen(false);
            reload();
          }}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editing && (
        <SpecFormModal
          title="Edit specialisation"
          initial={editing}
          onSubmit={async (body) => {
            await adminSpecialisationsApi.update(editing.id, body);
            setEditing(null);
            reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Delete &ldquo;{confirmDelete.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Existing provider profiles that reference this specialisation will keep the string
              but the picker won&apos;t offer it to new applicants.{' '}
              <b>To hide without deleting, toggle Active off instead.</b>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
              >Cancel</button>
              <button
                type="button"
                onClick={del}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Sub-components ─────────── */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full transition relative ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function SpecFormModal({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: SpecAdminRow;
  onSubmit: (body: Partial<SpecAdminRow>) => Promise<void>;
  onClose: () => void;
}) {
  const [slug,    setSlug]    = useState(initial?.slug ?? '');
  const [name,    setName]    = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'astrology');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100));
  const [isActive,      setIsActive]      = useState(initial?.isActive ?? true);
  const [isTrending,    setIsTrending]    = useState(initial?.isTrending ?? false);
  const [isPremiumOnly, setIsPremiumOnly] = useState(initial?.isPremiumOnly ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Partial<SpecAdminRow> = {
        name, category, description: description || null,
        sortOrder: parseInt(sortOrder, 10) || 100,
        isActive, isTrending, isPremiumOnly,
      };
      if (!initial) (body as any).slug = slug; // slug is create-only
      await onSubmit(body);
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!initial && (
            <Field label="Slug">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. lal-kitab"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Lowercase, digits, hyphens. Immutable after create.</p>
            </Field>
          )}
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lal Kitab"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l} ({k})</option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional, admin-only)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort order">
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Toggle on={isActive} onChange={setIsActive} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Toggle on={isTrending} onChange={setIsTrending} /> Trending
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Toggle on={isPremiumOnly} onChange={setIsPremiumOnly} /> Premium
            </label>
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200"
          >Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name || (!initial && !slug)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400"
          >{busy ? 'Saving…' : (initial ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600 block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
