'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { profileDraft, ProfileDraft } from '@/lib/profile-draft';
import { profileApi, ApiError } from '@/lib/api';
import Step1Identity from './setup-steps/Step1Identity';
import Step2Location from './setup-steps/Step2Location';
import Step3Preferences from './setup-steps/Step3Preferences';

/**
 * Profile-Setup Wizard
 *
 * Premium three-step onboarding that runs once, after a new user's first
 * OTP verification. The wizard is:
 *
 *   - Non-blocking: every step has a Skip affordance, and the whole flow
 *     can be dismissed ("Finish later"). Users land on the dashboard with
 *     a "Resume setup" card until they complete it.
 *   - Resumable: state is mirrored to localStorage on every change and
 *     synced to the backend through a debounced PATCH /profile. Cold
 *     reloads pick up exactly where the user left off.
 *   - Accessible: focus moves to the first field on step change, error
 *     messages use aria-live, and nothing requires a pointer.
 *
 * The actual fields for each step are intentionally placeholder — the
 * child Step* components own their own field lists. When product details
 * land, only those files need to change; the wizard plumbing stays put.
 */

/* ─── Step configuration ──────────────────────────────────────── */
export interface StepProps {
  /** Current merged draft data (read-only snapshot). */
  data: Record<string, unknown>;
  /** Merge a partial into the draft. */
  onChange: (patch: Record<string, unknown>) => void;
  /** Set by the step — blocks `Next` until true. */
  setValid: (valid: boolean) => void;
}

interface StepDef {
  id: string;
  title: string;
  subtitle: string;
  Component: React.ComponentType<StepProps>;
  /**
   * Optional soft-skip: steps marked optional show a "Skip this step" link.
   * Required steps only allow completing the wizard via the primary CTA.
   */
  optional: boolean;
}

const STEPS: StepDef[] = [
  {
    id: 'identity',
    title: 'Tell us about you',
    subtitle: 'The basics so we can personalise your experience.',
    Component: Step1Identity,
    optional: false,
  },
  {
    id: 'location',
    title: 'Where are you based?',
    subtitle: 'Helps us surface services near you.',
    Component: Step2Location,
    optional: true,
  },
  {
    id: 'preferences',
    title: 'Your preferences',
    subtitle: 'Tune your feed. You can change any of this later.',
    Component: Step3Preferences,
    optional: true,
  },
];

/* ─── Primitive UI bits ───────────────────────────────────────── */
function StepIndicator({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11.5px] font-semibold tracking-[1.2px] uppercase text-[#0F2452]/80">
        Step {current + 1} of {total}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(169,113,66,.15)' }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg,#C8932A,#C8932A 60%,#0F2452)',
            boxShadow: '0 0 12px rgba(169,113,66,.5)',
          }}
        />
      </div>
    </div>
  );
}

/* ─── Save-state pill ─────────────────────────────────────────── */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
function SavePill({ status }: { status: SaveStatus }) {
  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
      ? 'Saved'
      : status === 'error'
      ? 'Saved locally'
      : '';
  const color =
    status === 'error'
      ? '#B26B2F'
      : status === 'saved'
      ? '#1E7E45'
      : '#C8932A';
  if (!label) return <span className="h-5" aria-hidden />;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium"
      style={{ color }}
      aria-live="polite"
    >
      {status === 'saving' ? (
        <span
          className="w-2.5 h-2.5 rounded-full border-2 border-[#0F2452]/30 border-t-amber-700 animate-spin"
          aria-hidden
        />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

/* ─── Main ────────────────────────────────────────────────────── */
export default function ProfileSetupWizard() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [stepValid, setStepValid] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<'in' | 'out-forward' | 'out-back'>('in');

  const containerRef = useRef<HTMLDivElement | null>(null);

  /* ── Cold-start hydration: prefer server, fall back to local. ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = profileDraft.load();
      // Optimistically render local draft immediately for zero flicker.
      if (local.updatedAt > 0) {
        setData(local.data);
        setStepIdx(Math.min(local.step, STEPS.length - 1));
      }
      // Then reconcile with server if reachable.
      try {
        const remote = await profileApi.get();
        if (!cancelled && remote) {
          if (remote.completed) {
            // Already done — bail straight to dashboard.
            router.replace('/home');
            return;
          }
          // Server wins ties only if its updatedAt is newer.
          const remoteTs = new Date(remote.updatedAt).getTime();
          if (!Number.isNaN(remoteTs) && remoteTs >= local.updatedAt) {
            setData(remote.data ?? {});
            setStepIdx(Math.min(remote.step ?? 0, STEPS.length - 1));
          }
        }
      } catch (err) {
        // A 404 means "no profile row yet" — totally fine, keep the local view.
        // Anything else: surface nothing here; the user can still proceed.
        if (err instanceof ApiError && err.status !== 404) {
          // eslint-disable-next-line no-console
          console.warn('profile hydrate failed:', err.message);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* ── Reset the "valid" flag on step change — child reports on mount. ── */
  useEffect(() => {
    setStepValid(false);
    setTransitioning('in');
    // Move focus into the new step container for screen readers.
    const id = window.requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [stepIdx]);

  /* ── Save on any change. ── */
  const save = useCallback(
    (patch: Record<string, unknown>, nextStep?: number) => {
      setSaveStatus('saving');
      setData((prev: any) => {
        const merged = { ...prev, ...patch };
        try {
          profileDraft.save({
            step: nextStep ?? stepIdx,
            data: merged,
          });
          // Optimistic — the real server result flips via the draft layer.
          window.setTimeout(() => setSaveStatus('saved'), 400);
        } catch {
          setSaveStatus('error');
        }
        return merged;
      });
    },
    [stepIdx],
  );

  const current = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  /* ── Navigation ── */
  const goNext = useCallback(() => {
    if (!stepValid && !current.optional) return;
    setTransitioning('out-forward');
    window.setTimeout(() => {
      const next = Math.min(stepIdx + 1, STEPS.length - 1);
      profileDraft.save({ step: next, data });
      setStepIdx(next);
    }, 180);
  }, [stepValid, current.optional, stepIdx, data]);

  const goBack = useCallback(() => {
    if (stepIdx === 0) return;
    setTransitioning('out-back');
    window.setTimeout(() => {
      const prev = Math.max(stepIdx - 1, 0);
      setStepIdx(prev);
    }, 180);
  }, [stepIdx]);

  const finishLater = useCallback(() => {
    // Keep draft intact — user can resume from dashboard card.
    router.replace('/home?resume=profile');
  }, [router]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await profileDraft.finalize(data);
      // Post-finalize flow: route new users through the permissions screen
      // (location → notifications) before handing them to /home. The
      // permissions screen persists a `rg_permissions_seen` flag, so if the
      // user later revisits this wizard the redirect path still lands them
      // on /home immediately.
      router.replace('/permissions');
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save your profile. Please try again.',
      );
    }
  }, [submitting, data, router]);

  /* ── Transition classes ── */
  const transitionCls = useMemo(() => {
    if (transitioning === 'out-forward') return 'opacity-0 translate-x-4';
    if (transitioning === 'out-back') return 'opacity-0 -translate-x-4';
    return 'opacity-100 translate-x-0';
  }, [transitioning]);

  const StepComponent = current.Component;

  return (
    <main
      className="min-h-svh px-4 py-6"
      style={{
        background:
          'radial-gradient(ellipse 120% 60% at 50% -10%, #E8DFD0 0%, #F6F7FA 50%, #E8D0B0 100%)',
      }}
    >
      <div className="max-w-md mx-auto">
        {/* Top bar: logo + finish-later */}
        <div className="flex items-center justify-between mb-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(145deg, #C8932A 0%, #C8932A 55%, #0F2452 100%)',
              boxShadow: '0 4px 14px rgba(169,113,66,.35)',
            }}
          >
            <span style={{ fontFamily: 'Cinzel, serif' }} className="text-[#ffffff] text-[10px] font-bold tracking-widest">
              RG
            </span>
          </div>
          <button
            type="button"
            onClick={finishLater}
            className="text-[12.5px] font-medium text-[#0F2452] hover:opacity-75 transition-opacity"
          >
            Finish later
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-4">
          <StepIndicator current={stepIdx} total={STEPS.length} />
        </div>

        {/* Card */}
        <div
          ref={containerRef}
          className="rounded-3xl p-6 relative overflow-hidden"
          style={{
            background: 'rgba(255, 252, 245, 0.92)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(197, 138, 75, 0.2)',
            boxShadow:
              'inset 0 2px 0 rgba(255,255,255,.9), 0 20px 60px rgba(107,63,29,.14)',
          }}
        >
          {/* Heading */}
          <div className="mb-5">
            <h1
              style={{ fontFamily: 'Playfair Display, serif' }}
              className="text-[22px] font-bold text-[#0F2452] leading-tight tracking-tight"
            >
              {current.title}
            </h1>
            <p className="text-[13px] font-light text-gray-700/65 mt-1.5 leading-relaxed">
              {current.subtitle}
            </p>
          </div>

          {/* Step body with transition */}
          <div
            className={`transition-all duration-200 ease-out ${transitionCls}`}
            key={current.id}
            aria-live="polite"
          >
            {hydrated ? (
              <StepComponent
                data={data}
                onChange={save}
                setValid={setStepValid}
              />
            ) : (
              <div className="h-24 flex items-center justify-center">
                <span className="w-5 h-5 border-2 border-[#0F2452]/30 border-t-amber-700 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Inline error */}
          {error && (
            <p className="text-[12.5px] text-red-500 text-center mt-4" role="alert">
              {error}
            </p>
          )}

          {/* Footer: save state + primary action */}
          <div className="mt-6 flex items-center justify-between">
            <SavePill status={saveStatus} />
            {current.optional && !isLast && (
              <button
                type="button"
                onClick={goNext}
                className="text-[12.5px] font-medium text-[#0F2452]/70 hover:text-[#0F2452] transition-colors"
              >
                Skip this step
              </button>
            )}
          </div>

          {/* Primary button */}
          <button
            type="button"
            disabled={
              submitting || (!stepValid && !current.optional)
            }
            onClick={isLast ? submit : goNext}
            className="mt-4 w-full h-[52px] rounded-2xl font-semibold text-[15px] text-[#ffffff] flex items-center justify-center gap-2 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(140deg, #C8932A 0%, #C8932A 50%, #9A7B1E 100%)',
              boxShadow:
                (stepValid || current.optional) && !submitting
                  ? '0 6px 22px rgba(169,113,66,.42)'
                  : 'none',
            }}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                Finishing up…
              </>
            ) : isLast ? (
              <>
                Finish & continue
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </>
            ) : (
              <>
                Continue
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>

          {/* Back link */}
          {stepIdx > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="w-full mt-3 text-[12.5px] font-medium text-gray-700/60 hover:text-[#0F2452] transition-colors py-2"
            >
              ← Back
            </button>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-[11px] text-gray-700/45 mt-6 px-6 leading-relaxed">
          Your changes save automatically. You can finish this anytime from Profile.
        </p>
      </div>
    </main>
  );
}
