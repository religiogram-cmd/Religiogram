'use client';

/**
 * Step — Per-minute rate (astrologer + both flows).
 *
 * Number input for the rate in rupees/minute, converted to paise before
 * persistence. We show an experience-band-based suggested range as helper
 * text — backend accepts 500–100000 paise (₹5–₹1000/min) but we nudge
 * providers toward a realistic band for their tenure so they don't
 * accidentally under-price themselves or price out of market.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding, rupeesToPaise } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

/** Rupees-per-minute suggested band by years of experience. */
function suggestedBandRupees(exp: number | undefined): { min: number; max: number; label: string } {
  const e = typeof exp === 'number' ? exp : 0;
  if (e >= 20) return { min: 50, max: 300, label: '20+ years' };
  if (e >= 15) return { min: 30, max: 150, label: '15–20 years' };
  if (e >= 10) return { min: 20, max: 100, label: '10–15 years' };
  if (e >= 4)  return { min: 10, max: 50,  label: '4–9 years'  };
  return         { min: 10, max: 20,  label: '0–3 years'  };
}

/** Backend accepts 5–1000 rupees per minute (500–100000 paise). */
const MIN_RUPEES = 5;
const MAX_RUPEES = 1000;

export default function Step_PerMinuteRate({ flow }: { flow: FlowConfig }) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const initialRupees = typeof data.perMinutePaise === 'number' && data.perMinutePaise > 0
    ? String(Math.round(data.perMinutePaise / 100))
    : '';

  const [rate, setRate] = useState<string>(initialRupees);
  const [err, setErr] = useState<string | null>(null);

  const band = useMemo(() => suggestedBandRupees(data.experienceYears), [data.experienceYears]);

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
    const n = Number(rate);
    if (Number.isFinite(n) && n >= MIN_RUPEES && n <= MAX_RUPEES) {
      update({ perMinutePaise: rupeesToPaise(n) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  const numericRate = Number(rate);
  const rateValid =
    Number.isFinite(numericRate) &&
    numericRate >= MIN_RUPEES &&
    numericRate <= MAX_RUPEES;

  const belowBand = rateValid && numericRate < band.min;
  const aboveBand = rateValid && numericRate > band.max;

  const canContinue = rateValid;

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

  const quickPicks = useMemo(() => {
    const points = [
      band.min,
      Math.round((band.min + band.max) / 2),
      band.max,
    ];
    return Array.from(new Set(points));
  }, [band]);

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
          <p className="font-semibold text-gray-700 mb-1">Your per-minute rate</p>
          <p className="text-xs">
            Devotees pay for the length of each consultation. Same rate across
            chat, voice, and video — so it&apos;s one number to set.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
            Rate (₹ per minute)
          </span>
          <div className="flex items-stretch rounded-xl border border-[#0F2452]/20 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#0F2452]/40">
            <span className="px-3 flex items-center text-base text-gray-700/70">₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={`e.g. ${band.min}`}
              className="flex-1 px-2 py-3 bg-transparent text-base focus:outline-none"
            />
            <span className="px-3 flex items-center text-sm text-gray-700/60">/ min</span>
          </div>
          <p className="text-xs text-gray-700/60 mt-2">
            Suggested for <b>{band.label}</b> of experience: ₹{band.min}–₹{band.max} / min
          </p>
        </label>

        {/* Quick picks — a small nudge toward the middle of the band. */}
        <div className="flex flex-wrap gap-2">
          {quickPicks.map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setRate(String(v))}
              className={`px-4 py-2 rounded-full text-sm border transition
                ${
                  Number(rate) === v
                    ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                    : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                }`}
            >
              ₹{v}
            </button>
          ))}
        </div>

        {rate && !rateValid && (
          <p className="text-sm text-red-700">
            Rate must be between ₹{MIN_RUPEES} and ₹{MAX_RUPEES} per minute.
          </p>
        )}
        {belowBand && (
          <p className="text-xs text-amber-800/90 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            That&apos;s below the typical band for your experience — you can
            still continue, just make sure it&apos;s intentional.
          </p>
        )}
        {aboveBand && (
          <p className="text-xs text-amber-800/90 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            That&apos;s above the typical band for your experience — devotees
            may be slower to try you at first. You can adjust later.
          </p>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
