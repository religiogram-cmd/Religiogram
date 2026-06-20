'use client';

/**
 * /admin/applications/[id] — single application review.
 *
 * NEXT 15: params is a Promise that must be `await`ed. We unwrap it inside
 * a useEffect, then drive the data fetch off the resolved id. Doing the unwrap
 * synchronously (or via React.use directly without a guard) breaks the build.
 *
 * Actions live in a sticky right-side (desktop) / bottom (mobile) panel:
 *   Approve    — optional notes
 *   Reject     — reason required (>= 10 chars), optional internal notes
 *   Request Info — whatToFix required (>= 10 chars)
 *   Suspend    — visible only if current status is `approved`; reason required
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  adminApi,
  type AdminApplicationDetail,
  type AdminApplicationStatus,
} from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

type ActionKind = 'approve' | 'reject' | 'request_info' | 'suspend';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString();
}

function rupeesFromPaise(paise?: number | null): string {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return '—';
  return `₹${(paise / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: AdminApplicationStatus | string }) {
  const s = status as AdminApplicationStatus;
  const styles =
    s === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'rejected'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : s === 'suspended'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const label =
    s === 'pending_review'
      ? 'Pending review'
      : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${styles}`}
    >
      {label}
    </span>
  );
}

function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
      {(title || right) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              {title}
            </h2>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900 break-words">{value || '—'}</dd>
    </div>
  );
}

export default function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [data, setData] = useState<AdminApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal form state — kept here so opening/closing resets cleanly.
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [whatToFix, setWhatToFix] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.applications.get(id);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const provider = data?.provider ?? {};
  const status: AdminApplicationStatus =
    (provider.status as AdminApplicationStatus) ?? 'pending_review';
  const firstVideo = data?.kycVideos?.[0];

  const openAction = (kind: ActionKind) => {
    setNotes('');
    setReason('');
    setWhatToFix('');
    setAction(kind);
  };

  const closeAction = () => {
    if (submitting) return;
    setAction(null);
  };

  const runAction = useCallback(async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      if (action === 'approve') {
        await adminApi.applications.approve(id, notes.trim() || undefined);
        showToast('Approved', 'success');
        router.push('/admin/applications');
        return;
      }
      if (action === 'reject') {
        if (reason.trim().length < 10) {
          showToast('Reason must be at least 10 characters', 'error');
          setSubmitting(false);
          return;
        }
        await adminApi.applications.reject(id, reason.trim(), notes.trim() || undefined);
        showToast('Rejected', 'success');
        router.push('/admin/applications');
        return;
      }
      if (action === 'request_info') {
        if (whatToFix.trim().length < 10) {
          showToast('Please describe what to fix (10+ characters)', 'error');
          setSubmitting(false);
          return;
        }
        await adminApi.applications.requestInfo(id, whatToFix.trim());
        showToast('Info requested', 'success');
        setAction(null);
        setSubmitting(false);
        await fetchDetail();
        return;
      }
      if (action === 'suspend') {
        if (reason.trim().length < 10) {
          showToast('Reason must be at least 10 characters', 'error');
          setSubmitting(false);
          return;
        }
        await adminApi.applications.suspend(id, reason.trim());
        showToast('Suspended', 'success');
        router.push('/admin/applications');
        return;
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Action failed.';
      showToast(msg, 'error');
      setSubmitting(false);
    }
  }, [action, id, notes, reason, whatToFix, router, fetchDetail]);

  const modalCopy = useMemo(() => {
    if (action === 'approve')
      return {
        title: 'Approve application',
        body: 'This will let the priest start receiving bookings immediately.',
        cta: 'Approve',
        ctaClass: 'bg-emerald-600 hover:bg-emerald-700',
      };
    if (action === 'reject')
      return {
        title: 'Reject application',
        body: 'The priest will be notified. Provide a clear reason.',
        cta: 'Reject',
        ctaClass: 'bg-rose-600 hover:bg-rose-700',
      };
    if (action === 'request_info')
      return {
        title: 'Request more info',
        body: 'The priest will see exactly what you ask them to fix.',
        cta: 'Send request',
        ctaClass: 'bg-amber-600 hover:bg-amber-700',
      };
    if (action === 'suspend')
      return {
        title: 'Suspend provider',
        body: 'They will be hidden from devotees until reinstated.',
        cta: 'Suspend',
        ctaClass: 'bg-slate-900 hover:bg-slate-800',
      };
    return null;
  }, [action]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-10 shadow-sm flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-white border border-rose-200 p-6 shadow-sm">
        <p className="text-sm font-medium text-rose-700">Could not load application</p>
        <p className="text-sm text-slate-600 mt-1">{error ?? 'Unknown error'}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={fetchDetail}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
          >
            Retry
          </button>
          <Link
            href="/admin/applications"
            className="px-3 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 text-sm font-medium"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:space-y-0">
      <div className="space-y-5">
        <div>
          <Link
            href="/admin/applications"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← All applications
          </Link>
        </div>

        {/* Header card */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {provider.fullName || 'Unnamed applicant'}
              </h1>
              <p className="text-sm text-slate-500 mt-1 capitalize">
                {(provider.religion || '—') + ' • ' + (provider.city || '—')}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Submitted {formatDate(provider.updatedAt || provider.createdAt)}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>
        </Card>

        {/* Identity */}
        <Card title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                PAN
              </p>
              {data.panSignedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={data.panSignedUrl}
                  alt="PAN document"
                  className="w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
                  onError={() =>
                    console.error('PAN image failed to load:', data.panSignedUrl)
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">Not uploaded.</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                Selfie
              </p>
              {data.selfieSignedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={data.selfieSignedUrl}
                  alt="Selfie"
                  className="w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
                  onError={() =>
                    console.error('Selfie image failed to load:', data.selfieSignedUrl)
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">Not uploaded.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Introduction Video */}
        <Card title="Introduction Video">
          {firstVideo?.signedUrl ? (
            <div className="space-y-2">
              <video
                src={firstVideo.signedUrl}
                controls
                className="w-full rounded-lg border border-slate-200 bg-black"
              />
              <p className="text-xs text-slate-500">
                Duration: {firstVideo.durationSeconds ?? '—'}s • Status:{' '}
                {firstVideo.status || '—'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Not uploaded.</p>
          )}
        </Card>

        {/* Profile */}
        <Card title="Profile">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" value={provider.fullName} />
            <Field label="Date of birth" value={provider.dob ? String(provider.dob).slice(0, 10) : null} />
            <Field label="Phone" value={provider.phone} />
            <Field label="City" value={provider.city} />
            <Field label="Religion" value={<span className="capitalize">{provider.religion}</span>} />
            <Field label="Experience (years)" value={provider.experienceYears} />
            <Field
              label="Languages"
              value={
                Array.isArray(provider.languages) && provider.languages.length
                  ? provider.languages.join(', ')
                  : null
              }
            />
            <Field label="Bio" value={provider.bio} />
          </dl>
        </Card>

        {/* Pricing */}
        <Card title="Pricing">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Per minute"
              value={
                typeof provider.perMinutePaise === 'number'
                  ? `${rupeesFromPaise(provider.perMinutePaise)}/min`
                  : null
              }
            />
            <Field
              label="Service mode"
              value={<span className="capitalize">{provider.serviceMode}</span>}
            />
          </dl>
        </Card>

        {/* Payout */}
        <Card title="Payout">
          {data.bank ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Account" value={data.bank.masked} />
              <Field label="IFSC" value={data.bank.ifscCode} />
              <Field label="Bank" value={data.bank.bankName} />
              <Field label="Beneficiary" value={data.bank.beneficiaryName} />
              <Field label="UPI ID" value={data.bank.upiId} />
              <Field
                label="Verification"
                value={
                  data.bank.verificationStatus ? (
                    <span className="capitalize">{data.bank.verificationStatus}</span>
                  ) : null
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No payout details on file.</p>
          )}
        </Card>
      </div>

      {/* Action panel */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card title="Decision">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => openAction('approve')}
              disabled={status === 'approved'}
              className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => openAction('reject')}
              disabled={status === 'rejected'}
              className="w-full px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => openAction('request_info')}
              className="w-full px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
            >
              Request info
            </button>
            {status === 'approved' && (
              <button
                type="button"
                onClick={() => openAction('suspend')}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                Suspend
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Approve unlocks bookings instantly. Reject and Request info notify
            the priest by SMS/email.
          </p>
        </Card>
      </aside>

      {/* Modal */}
      {action && modalCopy && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={closeAction}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {modalCopy.title}
            </h3>
            <p className="text-sm text-slate-600 mt-1">{modalCopy.body}</p>

            <div className="mt-4 space-y-3">
              {action === 'approve' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    Internal notes (optional)
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Anything for the audit log…"
                  />
                </label>
              )}

              {(action === 'reject' || action === 'suspend') && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    Reason (required, min 10 chars)
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Why is this being rejected?"
                  />
                </label>
              )}

              {action === 'reject' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    Internal notes (optional)
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Notes for the audit log…"
                  />
                </label>
              )}

              {action === 'request_info' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    What should they fix? (required, min 10 chars)
                  </span>
                  <textarea
                    value={whatToFix}
                    onChange={(e) => setWhatToFix(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="e.g. Re-record intro video in a brighter room, holding ID up to the camera."
                  />
                </label>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeAction}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runAction}
                disabled={submitting}
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${modalCopy.ctaClass}`}
              >
                {submitting ? 'Working…' : modalCopy.cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
