'use client';

/**
 * Step 2 — Professional info.
 * Experience (dropdown), Languages (multi-pill), optional Bio.
 */

import { useEffect, useMemo, useState } from 'react';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

const EXP_OPTIONS = [
  { v: 0, label: 'Less than 1 year' },
  { v: 1, label: '1 year' },
  { v: 3, label: '3 years' },
  { v: 5, label: '5 years' },
  { v: 10, label: '10 years' },
  { v: 15, label: '15 years' },
  { v: 20, label: '20+ years' },
];

const SUGGESTED_LANGS = [
  'Hindi', 'English', 'Marathi', 'Bengali', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Gujarati', 'Punjabi', 'Urdu', 'Sanskrit', 'Arabic',
];

export default function Step2Page() {
  const { data, update, flush, advance } = useProviderOnboarding();
  const [exp, setExp] = useState<number | ''>(data.experienceYears ?? '');
  const [langs, setLangs] = useState<string[]>(data.languages ?? []);
  const [bio, setBio] = useState(data.bio ?? '');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    update({
      experienceYears: exp === '' ? undefined : Number(exp),
      languages: langs,
      bio,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp, langs, bio]);

  const toggleLang = (lng: string) => {
    setLangs((cur: any) =>
      cur.includes(lng) ? cur.filter((x: any) => x !== lng) : [...cur, lng],
    );
  };

  const canContinue = useMemo(
    () => exp !== '' && langs.length > 0 && bio.length <= 500,
    [exp, langs, bio],
  );

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
      await providerOnboardingApi.step2({
        experienceYears: Number(exp),
        languages: langs,
        bio: bio.trim() || undefined,
      });
      advance(3);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save.');
      throw e;
    }
  };

  return (
    <WizardShell currentStep={2} canContinue={canContinue} onContinue={onContinue}>
      <div className="space-y-6">
        <div>
          <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
            Years of experience
          </span>
          <select
            value={exp}
            onChange={(e) =>
              setExp(e.target.value === '' ? '' : Number(e.target.value))
            }
            className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base
                       focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40"
          >
            <option value="">Select…</option>
            {EXP_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
            Languages you speak
          </span>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_LANGS.map((lng) => {
              const on = langs.includes(lng);
              return (
                <button
                  type="button"
                  key={lng}
                  onClick={() => toggleLang(lng)}
                  className={`px-4 py-2 rounded-full text-sm border transition
                    ${
                      on
                        ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                        : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                    }`}
                >
                  {lng}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-700/60 mt-2">
            Pick as many as you're fluent in.
          </p>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
            Short bio <span className="text-gray-700/50">(optional)</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="Tell devotees a little about your background, training, or the traditions you follow."
            className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base
                       focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40 resize-y"
          />
          <p className="text-xs text-gray-700/60 mt-1 text-right">
            {bio.length} / 500
          </p>
        </div>

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
