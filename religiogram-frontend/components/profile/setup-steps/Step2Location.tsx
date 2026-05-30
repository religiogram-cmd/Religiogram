'use client';

import { useEffect } from 'react';
import type { StepProps } from '../ProfileSetupWizard';

/**
 * Step 2 — Location (placeholder, optional).
 *
 * Real fields TBD. Placeholder captures city + state so the wizard can
 * be exercised end-to-end and the API contract is non-empty.
 *
 * This step is marked optional in ProfileSetupWizard so the user can
 * advance with no input — but if they start typing, the standard
 * "min length 2" rule applies before Continue lights up.
 */
export default function Step2Location({ data, onChange, setValid }: StepProps) {
  const city = typeof data.city === 'string' ? data.city : '';
  const state = typeof data.state === 'string' ? data.state : '';

  // Optional step: empty is valid. If anything is filled in, both fields
  // need to be present (you don't want orphaned "Mumbai" with no state).
  const anyFilled = city.trim().length > 0 || state.trim().length > 0;
  const fullyFilled = city.trim().length >= 2 && state.trim().length >= 2;
  const valid = !anyFilled || fullyFilled;

  useEffect(() => {
    setValid(valid);
  }, [valid, setValid]);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.5px] uppercase text-gray-700/75">
          City
        </span>
        <input
          data-autofocus
          type="text"
          value={city}
          onChange={(e) => onChange({ city: e.target.value })}
          placeholder="e.g. Bengaluru"
          maxLength={60}
          autoComplete="address-level2"
          className="w-full h-12 px-4 rounded-2xl text-[14px] font-medium text-[#0F2452] bg-white/70 border-[1.5px] border-[#0F2452]/20 outline-none focus:bg-white focus:border-[#0F2452] focus:ring-4 focus:ring-[#0F2452]/15 transition-all"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.5px] uppercase text-gray-700/75">
          State / region
        </span>
        <input
          type="text"
          value={state}
          onChange={(e) => onChange({ state: e.target.value })}
          placeholder="e.g. Karnataka"
          maxLength={60}
          autoComplete="address-level1"
          className="w-full h-12 px-4 rounded-2xl text-[14px] font-medium text-[#0F2452] bg-white/70 border-[1.5px] border-[#0F2452]/20 outline-none focus:bg-white focus:border-[#0F2452] focus:ring-4 focus:ring-[#0F2452]/15 transition-all"
        />
      </label>

      {anyFilled && !fullyFilled && (
        <p className="text-[11.5px] text-[#0F2452]/80">
          Add both city and state, or skip this step entirely.
        </p>
      )}

      {/*
        TODO(product): pin location, postal code, country, address line —
        slot here. For India-only v1 we hard-code +91 elsewhere; address
        autocomplete (Google Places) plugs in as a wrapper around the city
        input above.
      */}
    </div>
  );
}
