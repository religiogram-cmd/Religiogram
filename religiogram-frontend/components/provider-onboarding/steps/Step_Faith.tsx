'use client';

/**
 * Step — Faith / religion selection (priest + both flows only).
 *
 * This is the gate for the services picker: the next step refuses to
 * render until a religion is set. Enforced both client-side (canContinue)
 * and server-side (assertReligionSet in the service).
 *
 * Changing a religion mid-onboarding clears previously-selected services.
 * We warn the user before letting them switch.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import {
  providerOnboardingApi,
  type Religion,
} from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

const OPTIONS: Array<{ value: Religion; label: string; emoji: string }> = [
  { value: 'hindu',     label: 'Hindu',     emoji: '🕉' },
  { value: 'islam',     label: 'Islam',     emoji: '☪' },
  { value: 'sikh',      label: 'Sikh',      emoji: '☬' },
  { value: 'christian', label: 'Christian', emoji: '✝' },
  { value: 'other',     label: 'Other',     emoji: '✦' },
];

export default function Step_Faith({ flow }: { flow: FlowConfig }) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();
  const [religion, setReligion] = useState<Religion | ''>(data.religion ?? '');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    providerOnboardingApi.getDraft().then((d) => {
      if (cancelled) return;
      const st = d.providerStatus;
      if (st === 'pending_review' || st === 'approved' || st === 'rejected') {
        router.replace('/provider-status');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    update({ religion: religion || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [religion]);

  const onContinue = async () => {
    if (!religion) return;
    setErr(null);
    try {
      if (
        data.religion &&
        data.religion !== religion &&
        (data.selectedServiceIds?.length || data.customServiceNames?.length)
      ) {
        const ok = confirm(
          `Changing your faith will clear previously-selected services. Continue?`,
        );
        if (!ok) return;
        update({ selectedServiceIds: [], customServiceNames: [] });
      }
      await flush();
      await providerOnboardingApi.step3({ religion });
      advance(flow.advanceTo);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save.');
      throw e;
    }
  };

  return (
    <WizardShell
      currentStep={flow.currentStep}
      totalSteps={flow.totalSteps}
      stepLabels={flow.stepLabels}
      routeBase={flow.routeBase}
      banner={flow.banner}
      canContinue={!!religion}
      onContinue={onContinue}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700/80">
          Pick the faith tradition your services are rooted in. This is
          what unlocks the service list in the next step.
        </p>

        <div className="space-y-2.5">
          {OPTIONS.map((o) => {
            const on = religion === o.value;
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => setReligion(o.value)}
                className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left border transition
                  ${
                    on
                      ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452] shadow-sm'
                      : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                  }`}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {o.emoji}
                </span>
                <span className="font-medium text-base">{o.label}</span>
                {on && (
                  <span className="ml-auto text-sm">Selected</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 px-3 py-2 rounded-lg bg-[#0F2452]/5 text-xs text-gray-700/80">
          Tip: choose <b>Other</b> if you offer interfaith or non-religious
          spiritual work (meditation, counselling, ceremonies).
        </div>

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
