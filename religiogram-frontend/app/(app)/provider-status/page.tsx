'use client';

/**
 * Provider KYC / Application Status Screen
 * Route: /provider-status
 *
 * Shows the provider their current verification state, step progress,
 * and next actions. Linked from Profile > "My Provider Status".
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const NAVY      = '#1B2A5C';
const GOLD      = '#C8920A';
const PARCHMENT = '#FFFBF0';

/** Shape of GET /v1/provider/onboarding/me (real backend). */
interface OnboardingMe {
  state: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended' | null;
  draft: Record<string, unknown>;
}

/** UI-facing status derived from the backend response. */
interface ProviderStatus {
  registered: boolean;
  status: string | null;
  kycSubmitted: boolean;
  isOnline?: boolean;
  currentStep: number;
  message: string;
  rejectionReason?: string | null;
  profileCompletedAt?: string | null;
}

const STEPS = [
  { n: 1, label: 'Basic Details' },
  { n: 2, label: 'Experience & Bio' },
  { n: 3, label: 'Religion' },
  { n: 4, label: 'Services' },
  { n: 5, label: 'Pricing' },
  { n: 6, label: 'Availability' },
  { n: 7, label: 'KYC Video' },
];

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
  draft:           { icon: '📋', color: '#d97706', label: 'Application In Progress' },
  pending_review:  { icon: '🔍', color: '#2563eb', label: 'Under Review' },
  approved:        { icon: '✅', color: '#16a34a', label: 'Approved' },
  rejected:        { icon: '❌', color: '#dc2626', label: 'Not Approved' },
  suspended:       { icon: '⛔', color: '#dc2626', label: 'Suspended' },
};

/** Derive UI status from the raw onboarding/me payload. */
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
  // Compute the highest step the user has reached based on which fields the
  // draft now carries. Mirrors the backend's per-step PATCH payload shape.
  let currentStep = 1;
  if (d['fullName'] && d['dob'] && d['phone'] && d['city']) currentStep = 2;
  if (currentStep >= 2 && d['experienceYears'] !== undefined) currentStep = 3;
  if (currentStep >= 3 && d['religion']) currentStep = 4;
  if (currentStep >= 4 /* services posted via /:id/services — best-effort */) currentStep = Math.max(currentStep, 5);
  if (currentStep >= 5 && d['perMinutePaise'] !== undefined) currentStep = 6;
  if (currentStep >= 6 && d['serviceMode']) currentStep = 7;
  if (me.state === 'pending_review' || me.state === 'approved' || me.state === 'rejected' || me.state === 'suspended') {
    currentStep = 7;
  }

  let message = '';
  switch (me.state) {
    case 'draft':
      message = currentStep < 7
        ? `Continue from Step ${currentStep} to finish your application.`
        : 'You’re ready to submit your KYC video — open Step 7 to record and send for review.';
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
    // Real backend: GET /v1/provider/onboarding/me. Returns 404 when the
    // user has never started — we treat that as "not registered" instead
    // of an error so the CTA can prompt them to start.
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
        minHeight: '100vh', backgroundColor: PARCHMENT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: `3px solid ${GOLD}`, borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: PARCHMENT,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', padding: 24,
      }}>
        <span style={{ fontSize: 40, marginBottom: 12 }}>⚠️</span>
        <p style={{ color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>
          {error ?? 'Could not load your provider status'}
        </p>
        <button
          onClick={() => router.back()}
          style={{
            marginTop: 20, padding: '10px 24px',
            backgroundColor: NAVY, color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const meta = data.status ? STATUS_META[data.status] : null;
  const completedSteps = Math.min(data.currentStep - 1, 7);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: PARCHMENT,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: NAVY, padding: '52px 20px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 22, lineHeight: 1, padding: 0,
          }}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: 0 }}>
            Provider Status
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: 0 }}>
            Your application & verification progress
          </p>
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* Status Card */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 20,
          marginBottom: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          borderLeft: `4px solid ${meta?.color ?? GOLD}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 36 }}>{meta?.icon ?? '📋'}</span>
            <div>
              <div style={{
                fontSize: 18, fontWeight: 700,
                color: meta?.color ?? NAVY,
              }}>
                {meta?.label ?? 'Not Started'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {data.status ? `Status: ${data.status.replace(/_/g, ' ')}` : 'No application yet'}
              </div>
            </div>
          </div>

          <p style={{
            fontSize: 13, color: '#374151', lineHeight: 1.5,
            backgroundColor: '#f9fafb', borderRadius: 8,
            padding: '10px 12px', margin: 0,
          }}>
            {data.message}
          </p>

          {data.rejectionReason && (
            <div style={{
              marginTop: 12,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                Rejection Reason
              </div>
              <div style={{ fontSize: 13, color: '#374151' }}>{data.rejectionReason}</div>
            </div>
          )}
        </div>

        {/* Onboarding Progress */}
        <div style={{
          backgroundColor: '#fff', borderRadius: 16, padding: 20,
          marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 16px' }}>
            Application Progress
          </h2>

          {STEPS.map((step) => {
            const done = step.n <= completedSteps;
            const current = step.n === data.currentStep;
            return (
              <div
                key={step.n}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                  borderBottom: step.n < STEPS.length ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: done ? '#16a34a' : current ? GOLD : '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 12, fontWeight: 700,
                  color: done || current ? '#fff' : '#9ca3af',
                }}>
                  {done ? '✓' : step.n}
                </div>
                <span style={{
                  fontSize: 14,
                  color: done ? '#374151' : current ? NAVY : '#9ca3af',
                  fontWeight: current ? 700 : 400,
                }}>
                  {step.label}
                  {current && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 700,
                      backgroundColor: GOLD, color: '#fff',
                      borderRadius: 4, padding: '1px 6px',
                    }}>
                      NEXT
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live status badge if approved */}
        {data.status === 'approved' && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 12, padding: '14px 16px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: data.isOnline ? '#22c55e' : '#d1d5db',
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                {data.isOnline ? 'You are currently Online' : 'You are currently Offline'}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Toggle your availability from the Provider Dashboard
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {!data.registered && (
          <button
            onClick={() => router.push('/provider-onboarding/step-1')}
            style={{
              width: '100%', padding: '14px 0',
              backgroundColor: NAVY, color: '#fff',
              border: 'none', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            Start Provider Application
          </button>
        )}

        {data.registered && (data.status === 'draft' || data.status === 'rejected') && data.currentStep <= 7 && (
          <button
            onClick={() => router.push(`/provider-onboarding/step-${data.currentStep}`)}
            style={{
              width: '100%', padding: '14px 0',
              backgroundColor: GOLD, color: '#fff',
              border: 'none', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            Continue Step {data.currentStep} →
          </button>
        )}

        {data.status === 'rejected' && (
          <button
            onClick={() => window.open('mailto:support@religiogram.in?subject=Provider%20Application%20Review', '_blank')}
            style={{
              width: '100%', padding: '14px 0',
              backgroundColor: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 12,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            Contact Support
          </button>
        )}

      </div>
    </div>
  );
}
