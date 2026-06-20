'use client';

/**
 * Step 1 — Basic details.
 *
 * Fields: Full Name, DOB, Phone (read-only, from token), City.
 * We deliberately keep each input on its own row — paired fields are
 * harder on small screens for older users.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function minDobIso(): string {
  // Reasonable lower bound — 100 years ago.
  const d = new Date();
  d.setFullYear(d.getFullYear() - 100);
  return d.toISOString().slice(0, 10);
}
function maxDobIso(): string {
  // Must be at least 18 years old.
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export default function Step1Page() {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();
  const [fullName, setFullName] = useState(data.fullName ?? '');
  const [dob, setDob] = useState(data.dob ?? '');
  const [phone, setPhone] = useState(data.phone ?? '');
  const [city, setCity] = useState(data.city ?? '');
  const [err, setErr] = useState<string | null>(null);

  /* Gate: if already submitted/decided, jump to status page. */
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

  // Mirror state → store on each edit (debounced autosave lives in store).
  useEffect(() => {
    update({ fullName, dob, phone, city });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, dob, phone, city]);

  const canContinue = useMemo(() => {
    return (
      fullName.trim().length >= 2 &&
      /^\d{10}$/.test(phone) &&
      city.trim().length >= 2 &&
      !!dob &&
      dob <= maxDobIso()
    );
  }, [fullName, phone, city, dob]);

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
      await providerOnboardingApi.step1({
        fullName: fullName.trim(),
        dob,
        phone,
        city: city.trim(),
      });
      advance(2);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save. Please try again.');
      throw e;
    }
  };

  return (
    <WizardShell
      currentStep={1}
      canContinue={canContinue}
      onContinue={onContinue}
      hideBack
    >
      <div className="space-y-5">
        <Field label="Full name">
          <input
            className={inputCls}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Ramesh Sharma"
            autoComplete="name"
            maxLength={120}
          />
        </Field>

        <Field label="Date of birth">
          <input
            className={inputCls}
            type="date"
            value={dob}
            min={minDobIso()}
            max={maxDobIso()}
            onChange={(e) => setDob(e.target.value)}
          />
          <p className="text-xs text-gray-700/60 mt-1">
            You must be at least 18 years old.
          </p>
        </Field>

        <Field label="Phone (your login number)">
          <input
            className={`${inputCls} bg-[#0F2452]/5`}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            autoComplete="tel-national"
            readOnly={!!data.phone}
          />
        </Field>

        <Field label="City">
          <input
            className={inputCls}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Jaipur"
            autoComplete="address-level2"
            maxLength={120}
          />
          <p className="text-xs text-gray-700/60 mt-1">
            Where you'd like to accept bookings. You can add more cities later.
          </p>
        </Field>

        {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
      </div>
    </WizardShell>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base ' +
  'focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40 focus:border-[#0F2452]/60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
