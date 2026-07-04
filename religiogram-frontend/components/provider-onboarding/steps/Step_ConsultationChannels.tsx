'use client';

/**
 * Step — Consultation channels (astrologer + both flows).
 *
 * Multi-select toggle across Chat / Voice / Video. Saves to
 * `data.consultationChannels`. All three are billed per minute — the
 * rate is set on the very next step, so we frame this as "which
 * channels" and not "which rate".
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

type Channel = 'chat' | 'voice' | 'video';

const OPTIONS: Array<{ value: Channel; label: string; desc: string; emoji: string }> = [
  { value: 'chat',  label: 'Chat',  desc: 'Real-time text messages',   emoji: '💬' },
  { value: 'voice', label: 'Voice', desc: 'Audio-only calls',           emoji: '📞' },
  { value: 'video', label: 'Video', desc: 'Face-to-face video calls',   emoji: '🎥' },
];

export default function Step_ConsultationChannels({ flow }: { flow: FlowConfig }) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();
  const [picks, setPicks] = useState<Channel[]>(
    (data.consultationChannels as Channel[]) ?? [],
  );
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
    update({ consultationChannels: picks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  const toggle = (c: Channel) =>
    setPicks((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
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
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F6F7FA]/40 border border-[#0F2452]/15 p-4 text-sm text-gray-700/90">
          <p className="font-semibold text-gray-700 mb-1">How would you like to consult?</p>
          <p className="text-xs">
            All three modes are billed <b>per minute</b>. You&apos;ll set a
            single rate on the next screen — devotees pay the same rate whether
            they pick chat, voice, or video.
          </p>
        </div>

        <div className="space-y-2.5">
          {OPTIONS.map((o) => {
            const on = picks.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => toggle(o.value)}
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
                <span className="flex-1">
                  <span className="block font-semibold text-base">{o.label}</span>
                  <span className={`block text-xs mt-0.5 ${on ? 'text-[#F7EFE1]/80' : 'text-gray-700/70'}`}>
                    {o.desc}
                  </span>
                </span>
                {on && <span className="text-sm">Selected</span>}
              </button>
            );
          })}
        </div>

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
