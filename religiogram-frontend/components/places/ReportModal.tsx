'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  reportsApi,
  tokenStore,
  type ReportTargetType,
} from '@/lib/api';
import { analytics } from '@/lib/analytics';

/**
 * ReportModal — a small, self-contained modal for flagging a single event
 * or service for moderation review.
 *
 * Why a separate component?
 *   - Both EventCard and ServicesSection need this exact flow; keeping it
 *     here means one place to evolve copy / validation / analytics.
 *   - The backend's 5-per-hour throttle and unique-per-target index both
 *     map to specific states here (rate-limited vs already-reported), so
 *     the error handling has enough shape to justify its own file.
 *
 * UX contract
 *   - Not signed in → we show an inline prompt instead of blocking the
 *     user with a generic "Unauthorised" toast. The backend route is
 *     @UseGuards(JwtAuthGuard), so calling it without a token is a
 *     wasted round-trip we catch client-side.
 *   - After a successful submit we flip into a "thank you" state and
 *     disable the button. Closing and re-opening re-enables submission,
 *     but the backend's UNIQUE (user_id, target_id) index will 409 the
 *     second attempt — which we surface as a friendly "already reported".
 *
 * Accessibility
 *   - Traps focus informally by moving focus to the textarea on open.
 *   - Esc closes the modal; body scroll is locked while open.
 *   - The reason textarea is the labelled field; submit is disabled
 *     until it passes the 10-char minimum so screen readers announce
 *     the length requirement through validation.
 */

const REASON_MIN = 10;
const REASON_MAX = 1000;

export interface ReportModalProps {
  placeId: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Human-readable label shown in the header, e.g. the event title. */
  targetLabel: string;
  onClose: () => void;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export default function ReportModal({
  placeId,
  targetType,
  targetId,
  targetLabel,
  onClose,
}: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const signedIn = typeof window !== 'undefined' && !!tokenStore.access;

  /* ── Focus + scroll lock + Esc handler ── */
  useEffect(() => {
    // Prefer focusing the textarea; fall back to the close button when
    // the user is signed out and the textarea isn't rendered.
    (textareaRef.current ?? closeRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const trimmed = reason.trim();
  const remaining = REASON_MAX - reason.length;
  const reasonValid = trimmed.length >= REASON_MIN && reason.length <= REASON_MAX;
  const canSubmit = signedIn && reasonValid && state.kind === 'idle';

  const headerLabel = useMemo(
    () => (targetType === 'event' ? 'event' : 'service'),
    [targetType],
  );

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    try {
      await reportsApi.submit({
        placeId,
        targetType,
        targetId,
        reason: trimmed,
      });
      // Fire-and-forget beacon — product needs the surface so we can
      // compare report-rate per section.
      analytics.reportSubmitted(targetType, placeId, targetId);
      setState({ kind: 'done' });
    } catch (e) {
      if (e instanceof ApiError) {
        // Known-shape errors get specific, actionable copy.
        if (e.status === 409) {
          setState({
            kind: 'error',
            message:
              'You have already reported this. An admin will review it.',
          });
          return;
        }
        if (e.status === 429) {
          setState({
            kind: 'error',
            message:
              'You have submitted too many reports recently. Please try again later.',
          });
          return;
        }
        if (e.status === 401) {
          setState({
            kind: 'error',
            message: 'Please sign in to submit a report.',
          });
          return;
        }
        setState({
          kind: 'error',
          message: e.message || 'Could not submit report. Please try again.',
        });
        return;
      }
      setState({
        kind: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }, [canSubmit, placeId, targetType, targetId, trimmed]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(30,15,5,.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-auto"
        style={{
          background: 'linear-gradient(180deg,#FFFDF8,#FFF7EC)',
          border: '1px solid rgba(197,138,75,.3)',
        }}
      >
        <div
          className="w-12 h-1.5 rounded-full mx-auto mb-4 sm:hidden"
          style={{ background: 'rgba(197,138,75,.35)' }}
          aria-hidden
        />

        <h2
          id="report-title"
          className="text-[18px] font-extrabold text-[#0F2452]"
          style={{ fontFamily: "'Playfair Display',serif" }}
        >
          Report this {headerLabel}
        </h2>
        <p className="text-[12.5px] text-gray-700/75 mt-1 leading-relaxed break-words">
          <span className="text-gray-700/60">Reporting:</span>{' '}
          <span className="font-semibold text-[#5A2C10]">{targetLabel}</span>
        </p>

        {/* Not signed in → inline prompt, no form */}
        {!signedIn ? (
          <div className="mt-5">
            <div
              className="rounded-xl p-3.5"
              style={{
                background: 'rgba(197,138,75,.08)',
                border: '1px solid rgba(197,138,75,.25)',
              }}
            >
              <p className="text-[13px] font-semibold text-[#5A2C10]">
                Sign in to submit a report
              </p>
              <p className="text-[12px] text-gray-700/70 mt-0.5 leading-relaxed">
                We require an account so our moderation team can follow up
                if they need more details.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
                style={{
                  background: 'rgba(255,247,236,.7)',
                  color: '#6B3A14',
                  border: '1px solid rgba(197,138,75,.3)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : state.kind === 'done' ? (
          /* Success state — replaces the form with a confirmation */
          <div className="mt-5">
            <div
              className="rounded-xl p-3.5 flex items-start gap-3"
              style={{
                background: 'rgba(34,139,84,.08)',
                border: '1px solid rgba(34,139,84,.25)',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#228B54', color: 'white' }}
                aria-hidden
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#1F5E3A]">
                  Report submitted
                </p>
                <p className="text-[12px] text-[#2F6B45]/85 mt-0.5 leading-relaxed">
                  An admin will review this {headerLabel}. Thanks for helping
                  keep the community safe.
                </p>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-2xl font-semibold text-[13.5px]"
              style={{
                background: 'linear-gradient(135deg,#C8932A,#C8932A)',
                color: '#FFFCF5',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          /* Default — reason form */
          <>
            <label
              htmlFor="report-reason"
              className="block text-[12px] font-semibold text-[#5A2C10] mt-4"
            >
              What&apos;s wrong with this {headerLabel}?
            </label>
            <textarea
              id="report-reason"
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              maxLength={REASON_MAX}
              placeholder="Please describe the issue in a few sentences. Include specifics — what's inaccurate, offensive, or inappropriate?"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] resize-vertical focus:outline-none focus:ring-2"
              style={{
                background: 'rgba(255,252,245,.9)',
                border: '1px solid rgba(197,138,75,.3)',
                color: '#0F2452',
              }}
              aria-describedby="report-reason-help"
            />
            <div
              id="report-reason-help"
              className="flex items-center justify-between mt-1 text-[11px]"
            >
              <span className="text-gray-700/55">
                {trimmed.length < REASON_MIN
                  ? `Please write at least ${REASON_MIN} characters.`
                  : 'Thanks — your report will be reviewed privately.'}
              </span>
              <span
                className={
                  remaining < 50
                    ? 'text-red-700/80 font-semibold'
                    : 'text-gray-700/55'
                }
              >
                {remaining}
              </span>
            </div>

            {state.kind === 'error' && (
              <p
                role="alert"
                className="mt-3 text-[12px] text-red-700/90 leading-relaxed"
              >
                {state.message}
              </p>
            )}

            <div className="flex items-center gap-2 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
                style={{
                  background: 'rgba(255,247,236,.7)',
                  color: '#6B3A14',
                  border: '1px solid rgba(197,138,75,.3)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-extrabold disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg,#A85A1E,#C9762F)',
                  color: '#FFF7EC',
                  border: '1px solid rgba(168,90,30,.35)',
                }}
              >
                {state.kind === 'submitting' ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
