'use client';

/**
 * /admin/providers — provider management.
 *
 * Two orthogonal filters (status + category) over the paginated providers
 * list. Per-row we surface:
 *   • Edit — full profile modal that PATCHes /admin/providers/:id
 *   • Moderate — approve / reject / suspend / ban with a reason textarea
 *
 * `perMinutePaise` is shown/edited in rupees for the admin's sanity; we
 * multiply back to paise on save to match the wire format.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  adminProvidersApi,
  type AdminProviderRow,
  type AdminProviderDetail,
  type AdminProviderEditPayload,
  type ProviderStatus,
  type ProviderCategory,
  type ServiceMode,
  type ConsultationChannel,
  type ModerationAction,
} from '@/lib/admin-api';

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  priest:     'Priest',
  astrologer: 'Astrologer',
  both:       'Both',
};

const STATUS_LABEL: Record<ProviderStatus, string> = {
  pending:   'Pending review',
  approved:  'Approved',
  rejected:  'Rejected',
  suspended: 'Suspended',
  banned:    'Banned',
};

/* Backend enum: chat | voice | video. The wire value for phone-style calls
 * is 'voice' — matches the astrologer onboarding + marketplace filter. */
const CHANNELS: ConsultationChannel[] = ['chat', 'voice', 'video'];

export default function AdminProvidersPage() {
  const [rows, setRows] = useState<AdminProviderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [status, setStatus] = useState<ProviderStatus | ''>('');
  const [category, setCategory] = useState<ProviderCategory | ''>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [moderate, setModerate] = useState<{ id: string; row: AdminProviderRow; action: ModerationAction } | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const resp = await adminProvidersApi.list({
        status: status || undefined,
        category: category || undefined,
        limit: 50,
      });
      setRows(resp.items);
      setNextCursor(resp.nextCursor);
      setHasMore(resp.hasMore);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, category]);

  const loadMore = async () => {
    if (!hasMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const resp = await adminProvidersApi.list({
        status: status || undefined,
        category: category || undefined,
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

  const applyModeration = async (reason: string) => {
    if (!moderate) return;
    await adminProvidersApi.moderate(moderate.id, { action: moderate.action, reason: reason || undefined });
    setModerate(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Providers</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Approve, moderate and edit priest and astrologer profiles.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProviderStatus | '')}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ProviderCategory | '')}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">All categories</option>
          <option value="priest">Priest</option>
          <option value="astrologer">Astrologer</option>
          <option value="both">Both</option>
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
          No providers match your filters.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">City</th>
                  <th className="px-4 py-2.5 font-medium text-right">Rating</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <ProviderRow
                    key={p.id}
                    provider={p}
                    onEdit={() => setEditingId(p.id)}
                    onModerate={(action) => setModerate({ id: p.id, row: p, action })}
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

      {editingId && (
        <ProviderEditModal
          providerId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={async () => { setEditingId(null); await load(); }}
        />
      )}

      {moderate && (
        <ModerationConfirmModal
          providerName={moderate.row.fullName}
          action={moderate.action}
          onCancel={() => setModerate(null)}
          onConfirm={applyModeration}
        />
      )}
    </div>
  );
}

/* ─────────── Row + badges ─────────── */

function ProviderRow({
  provider, onEdit, onModerate,
}: {
  provider: AdminProviderRow;
  onEdit: () => void;
  onModerate: (a: ModerationAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/40">
      <td className="px-4 py-2.5 font-medium text-slate-900">{provider.fullName}</td>
      <td className="px-4 py-2.5">
        <CategoryBadge category={provider.providerCategory} />
      </td>
      <td className="px-4 py-2.5 text-slate-600">{provider.city || '—'}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">
        {provider.ratingAvg !== null ? provider.ratingAvg.toFixed(2) : '—'}
        <span className="text-xs text-slate-500 ml-1">({provider.ratingCount})</span>
      </td>
      <td className="px-4 py-2.5">
        <ProviderStatusBadge status={provider.status} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex gap-1.5 items-center relative">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
          >Edit</button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
          >Moderate ▾</button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-slate-200 bg-white shadow-lg w-36 py-1 text-left"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <MenuBtn onClick={() => { setMenuOpen(false); onModerate('approve'); }} tone="emerald">Approve</MenuBtn>
              <MenuBtn onClick={() => { setMenuOpen(false); onModerate('reject');  }} tone="amber">Reject</MenuBtn>
              <MenuBtn onClick={() => { setMenuOpen(false); onModerate('suspend'); }} tone="amber">Suspend</MenuBtn>
              <MenuBtn onClick={() => { setMenuOpen(false); onModerate('ban');     }} tone="red">Ban</MenuBtn>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function MenuBtn({
  onClick, tone, children,
}: {
  onClick: () => void;
  tone: 'emerald' | 'amber' | 'red';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'emerald' ? 'text-emerald-700 hover:bg-emerald-50'
  : tone === 'amber'   ? 'text-amber-700   hover:bg-amber-50'
  :                      'text-red-700     hover:bg-red-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-xs px-3 py-1.5 ${cls}`}
    >{children}</button>
  );
}

function CategoryBadge({ category }: { category: ProviderCategory }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium">
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  const cls =
    status === 'approved'  ? 'bg-emerald-100 text-emerald-800'
  : status === 'pending'   ? 'bg-slate-100   text-slate-700'
  : status === 'rejected'  ? 'bg-amber-100   text-amber-800'
  : status === 'suspended' ? 'bg-amber-100   text-amber-800'
  :                          'bg-red-100     text-red-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ─────────── Moderation modal ─────────── */

function ModerationConfirmModal({
  providerName, action, onCancel, onConfirm,
}: {
  providerName: string;
  action: ModerationAction;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label =
    action === 'approve' ? 'Approve'
  : action === 'reject'  ? 'Reject'
  : action === 'suspend' ? 'Suspend'
  :                        'Ban';

  const btnCls =
    action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700'
  : action === 'reject'  ? 'bg-amber-600   hover:bg-amber-700'
  : action === 'suspend' ? 'bg-amber-600   hover:bg-amber-700'
  :                        'bg-red-600     hover:bg-red-700';

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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{label} provider</h2>
          <p className="mt-1 text-sm text-slate-600">{providerName}</p>
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
          >{busy ? 'Saving…' : label}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Edit modal ─────────── */

function ProviderEditModal({
  providerId, onClose, onSaved,
}: {
  providerId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminProviderDetail | null>(null);

  // form state
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [religion, setReligion] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [languages, setLanguages] = useState('');
  const [serviceMode, setServiceMode] = useState<ServiceMode>('online');
  const [providerCategory, setProviderCategory] = useState<ProviderCategory>('priest');
  const [perMinuteRupees, setPerMinuteRupees] = useState('');
  const [specialisations, setSpecialisations] = useState('');
  const [channels, setChannels] = useState<ConsultationChannel[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const d = await adminProvidersApi.get(providerId);
        setDetail(d);
        setFullName(d.fullName ?? '');
        setCity(d.city ?? '');
        setBio(d.bio ?? '');
        setReligion(d.religion ?? '');
        setExperienceYears(d.experienceYears != null ? String(d.experienceYears) : '');
        setLanguages((d.languages ?? []).join(', '));
        setServiceMode((d.serviceMode ?? 'online') as ServiceMode);
        setProviderCategory(d.providerCategory);
        setPerMinuteRupees(d.perMinutePaise != null ? String(d.perMinutePaise / 100) : '');
        setSpecialisations((d.specialisations ?? []).join(', '));
        setChannels(d.consultationChannels ?? []);
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load provider');
      } finally {
        setLoading(false);
      }
    })();
  }, [providerId]);

  const toggleChannel = (c: ConsultationChannel) => {
    setChannels((cur) => cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: AdminProviderEditPayload = {
        fullName: fullName.trim(),
        city: city.trim(),
        bio: bio.trim(),
        religion: religion.trim() || undefined,
        experienceYears: experienceYears ? parseInt(experienceYears, 10) : undefined,
        languages: languages.split(',').map((s) => s.trim()).filter(Boolean),
        serviceMode,
        providerCategory,
        perMinutePaise: perMinuteRupees ? Math.round(parseFloat(perMinuteRupees) * 100) : undefined,
        specialisations: specialisations.split(',').map((s) => s.trim()).filter(Boolean),
        consultationChannels: channels,
      };
      await adminProvidersApi.edit(providerId, body);
      await onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Edit provider</h2>
          {detail && <p className="mt-1 text-xs text-slate-500 font-mono">{detail.id}</p>}
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-sm text-slate-500">Loading…</div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name">
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </Field>
                <Field label="City">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </Field>
              </div>
              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Religion">
                  <input
                    value={religion}
                    onChange={(e) => setReligion(e.target.value)}
                    placeholder="e.g. hindu"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </Field>
                <Field label="Experience (years)">
                  <input
                    type="number"
                    min={0}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </Field>
              </div>
              <Field label="Languages (comma-separated)">
                <input
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="Hindi, English, Sanskrit"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Service mode">
                  <select
                    value={serviceMode}
                    onChange={(e) => setServiceMode(e.target.value as ServiceMode)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    value={providerCategory}
                    onChange={(e) => setProviderCategory(e.target.value as ProviderCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="priest">Priest</option>
                    <option value="astrologer">Astrologer</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                <Field label="Per-minute rate (₹)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={perMinuteRupees}
                    onChange={(e) => setPerMinuteRupees(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </Field>
              </div>
              <Field label="Specialisations (comma-separated slugs)">
                <input
                  value={specialisations}
                  onChange={(e) => setSpecialisations(e.target.value)}
                  placeholder="vedic, tarot, numerology"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </Field>
              <Field label="Consultation channels">
                <div className="flex flex-wrap gap-2 mt-1">
                  {CHANNELS.map((c) => {
                    const on = channels.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleChannel(c)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          on
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </Field>
              {err && <p className="text-sm text-red-700">{err}</p>}
            </>
          ) : (
            <p className="text-sm text-red-700">{err ?? 'Failed to load'}</p>
          )}
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
            disabled={busy || loading || !detail}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400"
          >{busy ? 'Saving…' : 'Save'}</button>
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
