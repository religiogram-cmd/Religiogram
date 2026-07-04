'use client';

/**
 * Step — Astrology specialisations (astrologer + both flows).
 *
 * Multi-select chip picker. Persists to `data.specialisations`.
 *
 * We keep the option list here rather than in a shared constants file
 * because it's the only place it's used, and hard-coding the labels lets
 * us pick the exact display casing (e.g. "KP Astrology") without a lookup.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

const SPECIALISATION_OPTIONS = [
  'Vedic Astrology',
  'KP Astrology',
  'Nadi Astrology',
  'Tarot Reading',
  'Numerology',
  'Palmistry',
  'Face Reading',
  'Vastu',
];

export default function Step_Specialisations({ flow }: { flow: FlowConfig }) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();
  const [picks, setPicks] = useState<string[]>(data.specialisations ?? []);
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
    update({ specialisations: picks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  const toggle = (s: string) =>
    setPicks((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  const canContinue = picks.length >= 1;

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
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
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel={canContinue ? `Save & Continue (${picks.length})` : 'Pick at least one'}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-700/80">
          Which astrology systems do you practise? Devotees see these
          alongside your name so they can find the right guide.
        </p>

        <div className="flex flex-wrap gap-2">
          {SPECIALISATION_OPTIONS.map((s) => {
            const on = picks.includes(s);
            return (
              <button
                type="button"
                key={s}
                onClick={() => toggle(s)}
                className={`px-4 py-2.5 rounded-full text-sm border transition
                  ${
                    on
                      ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                      : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                  }`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-700/60">
          Pick every system you&apos;re confident consulting on. You can
          adjust these later from your profile settings.
        </p>

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
