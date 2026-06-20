'use client';

/**
 * Provider KYC / Application Status Screen
 * Route: /provider-status
 *
 * Shows the provider their current verification state, step progress,
 * and next actions in a polished, on-brand layout.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const NAVY     = '#0A1628';
const NAVY_2   = '#0F2452';
const GOLD     = '#C8920A';
const GOLD_L   = '#E0A92F';
const CREAM    = '#FFFAEC';
const TEXT     = '#1A0800';
const TEXT2    = '#4A3010';
const TEXT3    = '#8B6B35';

interface OnboardingMe {
  state: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended' | null;
  draft: Record<string, unknown>;
  panUploaded?: boolean;
  selfieUploaded?: boolean;
  bankSet?: boolean;
}

interface ProviderStatus {
  registered: boolean;
  status: string | null;
  kycSubmitted: boolean;
  isOnline?: boolean;
  currentStep: number;
  message: string;
  rejectionReason?: string | null;
}

const STEPS = [
  { n: 1, label: 'Basic Details' },
  { n: 2, label: 'Experience & Bio' },
  { n: 3, label: 'Religion' },
  { n: 4, label: 'Services' },
  { n: 5, label: 'Pricing' },
  { n: 6, label: 'Availability' },
  { n: 7, label: 'KYC Video' },
  { n: 8, label: 'Identity Documents' },
  { n: 9, label: 'Payout Setup' },
];

/* ── Professional inline SVG icons ──────────────────── */
function IconClock() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconCheck() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
function IconX() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
}
function IconPaused() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/></svg>;
}
function IconDraft() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function IconBack() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
}
function IconCheckSmall() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}

const STATUS_META: Record<string, { Icon: () => JSX.Element; tint: string; tintBg: string; label: string; subtle: string }> = {
  draft:           { Icon: IconDraft,  tint: '#A0570C', tintBg: 'rgba(200,146,10,0.10)',  label: 'In Progress',  subtle: 'Continue filling your application' },
  pending_review:  { Icon: IconClock,  tint: GOLD,      tintBg: 'rgba(200,146,10,0.12)',  label: 'Under Review', subtle: 'Awaiting team verification' },
  approved:        { Icon: IconCheck,  tint: '#0E7C5C', tintBg: 'rgba(14,124,92,0.10)',   label: 'Approved',     subtle: 'You are live on ReligioGram' },
  rejected:        { Icon: IconX,      tint: '#B91C1C', tintBg: 'rgba(185,28,28,0.08)',   label: 'Not Approved', subtle: 'Update your profile and re-apply' },
  suspended:       { Icon: IconPaused, tint: '#B91C1C', tintBg: 'rgba(185,28,28,0.08)',   label: 'Suspended',    subtle: 'Account temporarily disabled' },
};

function toProviderStatus(me: OnboardingMe | null): ProviderStatus {
  if (!me || !me.state) {
    return {
      registered: false,
      status: null,
      kycSubmitted: false,
      currentStep: 1,
      message: 'You haven’t started your provider application yet. Tap below to begin onboarding.',
    };
  }

  const d = me.draft ?? {};
  let currentStep = 1;
  if (d['fullName'] && d['dob'] && d['phone'] && d['city']) currentStep = 2;
  if (currentStep >= 2 && d['experienceYears'] !== undefined) currentStep = 3;
  if (currentStep >= 3 && d['religion']) currentStep = 4;
  if (currentStep >= 4) currentStep = Math.max(currentStep, 5);
  if (currentStep >= 5 && d['perMinutePaise'] !== undefined) currentStep = 6;
  if (currentStep >= 6 && d['serviceMode']) currentStep = 7;
  if (currentStep >= 7 && me['panUploaded']) currentStep = 8;
  if (currentStep >= 8 && me['selfieUploaded']) currentStep = 9;
  if (me.state === 'pending_review' || me.state === 'approved' || me.state === 'rejected' || me.state === 'suspended') {
    currentStep = 9;
  }

  let message = '';
  switch (me.state) {
    case 'draft':
      message = currentStep < 9
        ? `Continue from Step ${currentStep} to finish your application.`
        : 'You’re ready to submit — open the last step to send for review.';
      break;
    case 'pending_review':
      message = 'Your application is under review by our team. We aim to respond within 2 business days.';
      break;
    case 'approved':
      message = 'Your application has been approved. You can now appear in search and accept bookings.';
      break;
    case 'rejected':
      message = 'Your application was not approved. You can edit your draft and re-submit.';
      break;
    case 'suspended':
      message = 'Your account has been temporarily suspended. Contact support for details.';
      break;
  }

  return {
    registered: true,
    status: me.state,
    kycSubmitted: me.state !== 'draft',
    currentStep,
    message,
    rejectionReason: (d['rejectionReason'] as string | undefined) ?? null,
  };
}

export default function ProviderStatusPage() {
  const router = useRouter();
  const [data, setData]       = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch<OnboardingMe>('/provider/onboarding/me', { auth: true })
      .then(m => setData(toProviderStatus(m)))
      .catch((e: any) => {
        if (e?.status === 404) setData(toProviderStatus(null));
        else setError(e?.message ?? 'Failed to load status');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100svh', background: CREAM,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: `3px solid ${GOLD}33`, borderTopColor: GOLD,
          animation: 'rg-spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes rg-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100svh', background: CREAM,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', padding: 24, textAlign: 'center',
      }}>
        <div style={{ color: '#B91C1C', marginBottom: 12 }}><IconX /></div>
        <p style={{ color: TEXT2, fontWeight: 600 }}>
          {error ?? 'Could not load your provider status'}
        </p>
        <button
          onClick={() => router.back()}
          style={{
            marginTop: 20, padding: '10px 22px',
            background: NAVY_2, color: '#fff',
            border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
            fontFamily: 'inherit',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const meta = data.status ? STATUS_META[data.status] : null;
  const completedSteps = Math.min(data.currentStep - 1, 9);
  const StatusIcon = meta?.Icon ?? IconDraft;

  return (
    <div style={{
      minHeight: '100svh', background: CREAM,
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      paddingBottom: 28,
    }}>
      {/* Premium hero header */}
      <div style={{
        background: `linear-gradient(150deg, ${NAVY} 0%, ${NAVY_2} 60%, #1B2540 100%)`,
        padding: '18px 18px 22px',
        color: '#FFFAEC',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle ornamental ring */}
        <div style={{
          position: 'absolute', right: -40, top: -40,
          width: 180, height: 180, borderRadius: '50%',
          border: `1px solid ${GOLD_L}22`,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 140, height: 140, borderRadius: '50%',
          border: `1px solid ${GOLD_L}15`,
          pointerEvents: 'none',
        }} />

        <button
          onClick={() => router.back()}
          aria-label="Back"
          style={{
            background: 'rgba(255,255,255,0.10)', border: 'none',
            color: '#fff', cursor: 'pointer',
            width: 36, height: 36, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
        >
          <IconBack />
        </button>
        <div style={{ marginTop: 14 }}>
          <h1 style={{
            color: '#FFFAEC', fontWeight: 800, fontSize: 26, margin: 0,
            fontFamily: '"Playfair Display", Georgia, serif',
            letterSpacing: '-0.01em', lineHeight: 1.15,
          }}>
            Provider Status
          </h1>
          <p style={{
            color: GOLD_L, fontSize: 12.5, margin: '4px 0 0',
            fontWeight: 600, letterSpacing: '0.04em',
          }}>
            APPLICATION & VERIFICATION PROGRESS
          </p>
        </div>
      </div>

      <div style={{ padding: '18px 16px 24px', maxWidth: 520, margin: '0 auto' }}>

        {/* Status card */}
        <section style={{
          background: '#fff',
          borderRadius: 18,
          padding: 18,
          marginBottom: 14,
          border: '1px solid rgba(200,146,10,0.18)',
          boxShadow: '0 4px 18px rgba(15,36,82,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: meta?.tintBg ?? 'rgba(200,146,10,0.10)',
              color: meta?.tint ?? GOLD,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <StatusIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: meta?.tint ?? NAVY_2,
                fontFamily: '"Playfair Display", Georgia, serif',
                letterSpacing: '-0.01em',
              }}>
                {meta?.label ?? 'Not Started'}
              </div>
              <div style={{ fontSize: 11.5, color: TEXT3, marginTop: 2, fontWeight: 600 }}>
                {meta?.subtle ?? 'No application yet'}
              </div>
            </div>
          </div>

          <p style={{
            fontSize: 13, color: TEXT2, lineHeight: 1.55,
            background: '#FFFBF0', borderRadius: 12,
            padding: '11px 13px', margin: '14px 0 0',
            border: '1px solid rgba(200,146,10,0.10)',
          }}>
            {data.message}
          </p>

          {data.rejectionReason && (
            <div style={{
              marginTop: 12,
              background: 'rgba(185,28,28,0.06)',
              border: '1px solid rgba(185,28,28,0.18)',
              borderRadius: 12, padding: '11px 13px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#B91C1C', marginBottom: 4, letterSpacing: '0.05em' }}>
                REJECTION REASON
              </div>
              <div style={{ fontSize: 13, color: TEXT2 }}>{data.rejectionReason}</div>
            </div>
          )}
        </section>

        {/* Progress card */}
        <section style={{
          background: '#fff', borderRadius: 18, padding: 18,
          marginBottom: 14, border: '1px solid rgba(200,146,10,0.18)',
          boxShadow: '0 4px 18px rgba(15,36,82,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{
              fontSize: 16, fontWeight: 800, color: NAVY_2, margin: 0,
              fontFamily: '"Playfair Display", Georgia, serif',
              letterSpacing: '-0.01em',
            }}>
              Application Progress
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 700, color: TEXT3,
              background: 'rgba(200,146,10,0.10)', padding: '3px 9px',
              borderRadius: 999, letterSpacing: '0.05em',
            }}>
              {completedSteps}/{STEPS.length}
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Vertical connecting line */}
            <div style={{
              position: 'absolute', left: 13, top: 14, bottom: 14,
              width: 2, background: 'rgba(200,146,10,0.20)', borderRadius: 1,
            }} />

            {STEPS.map((step) => {
              const done = step.n <= completedSteps;
              const current = step.n === data.currentStep && data.status !== 'pending_review' && data.status !== 'approved';
              return (
                <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 0', position: 'relative' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` : current ? NAVY_2 : '#fff',
                    border: done ? 'none' : current ? 'none' : '2px solid rgba(200,146,10,0.30)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    fontSize: 11, fontWeight: 800,
                    color: done ? '#fff' : current ? '#fff' : TEXT3,
                    zIndex: 1,
                    boxShadow: done ? '0 2px 6px rgba(200,146,10,0.25)' : 'none',
                  }}>
                    {done ? <IconCheckSmall /> : step.n}
                  </div>
                  <span style={{ fontSize: 13.5, color: done ? TEXT2 : current ? NAVY_2 : TEXT3, fontWeight: current || done ? 700 : 500 }}>
                    {step.label}
                  </span>
                  {current && (
                    <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, background: NAVY_2, color: '#fff', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.06em' }}>
                      NEXT
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {data.status === 'approved' && (
          <div style={{ background: 'rgba(14,124,92,0.08)', border: '1px solid rgba(14,124,92,0.25)', borderRadius: 14, padding: '13px 15px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: data.isOnline ? '#10B981' : '#9CA3AF', flexShrink: 0, boxShadow: data.isOnline ? '0 0 0 3px rgba(16,185,129,0.20)' : 'none' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0E7C5C' }}>{data.isOnline ? 'Currently Online' : 'Currently Offline'}</div>
              <div style={{ fontSize: 11, color: TEXT3, marginTop: 2 }}>Toggle availability from your Provider dashboard</div>
            </div>
          </div>
        )}

        {!data.registered && (
          <button onClick={() => router.push('/provider-onboarding/step-1')} style={{ width: '100%', padding: '15px 0', background: `linear-gradient(135deg, ${NAVY_2}, ${NAVY})`, color: '#FFFAEC', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 14.5, cursor: 'pointer', letterSpacing: '0.02em', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(15,36,82,0.20)' }}>
            Start Provider Application
          </button>
        )}

        {data.registered && (data.status === 'draft' || data.status === 'rejected') && data.currentStep <= 9 && (
          <button onClick={() => router.push(`/provider-onboarding/step-${data.currentStep}`)} style={{ width: '100%', padding: '15px 0', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: '#FFFAEC', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 14.5, cursor: 'pointer', letterSpacing: '0.02em', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(200,146,10,0.25)' }}>
            Continue Step {data.currentStep}
          </button>
        )}

        {data.status === 'rejected' && (
          <button onClick={() => window.open('mailto:support@religiogram.in?subject=Provider%20Application%20Review', '_blank')} style={{ width: '100%', padding: '13px 0', marginTop: 10, background: 'transparent', color: '#B91C1C', border: '1.5px solid rgba(185,28,28,0.35)', borderRadius: 14, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            Contact Support
          </button>
        )}
      </div>
    </div>
  );
}
  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
              color: '#FFFAEC',
              border: 'none', borderRadius: 14,
              fontWeight: 800, fontSize: 14.5, cursor: 'pointer',
              letterSpacing: '0.02em', fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(200,146,10,0.25)',
            }}
          >
            Continue Step {data.currentStep}
          </button>
        )}

        {data.status === 'rejected' && (
          <button
            onClick={() => window.open('mailto:support@religiogram.in?subject=Provider%20Application%20Review', '_blank')}
            style={{
              width: '100%', padding: '13px 0', marginTop: 10,
              background: 'transparent', color: '#B91C1C',
              border: '1.5px solid rgba(185,28,28,0.35)', borderRadius: 14,
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Contact Support
          </button>
        )}
      </div>
    </div>
  );
}
