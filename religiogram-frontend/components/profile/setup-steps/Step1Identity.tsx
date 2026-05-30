'use client';

import { useEffect } from 'react';
import type { StepProps } from '../ProfileSetupWizard';

/**
 * Step 1 — Identity (placeholder).
 *
 * Real fields will replace this when product details land. The current
 * shape captures the minimum useful identity so the wizard plumbing is
 * exercisable end-to-end: a name and email. Both are also writable from
 * Profile → Edit later, so we're not locking users in.
 *
 * Any fields added here should follow the same pattern:
 *   1. Read from `data[key]` (typed as unknown — coerce safely).
 *   2. Write via onChange({ key: value }) — the wizard merges into draft.
 *   3. Call setValid(true/false) whenever validity changes.
 */
export default function Step1Identity({ data, onChange, setValid }: StepProps) {
  const name = typeof data.name === 'string' ? data.name : '';
  const email = typeof data.email === 'string' ? data.email : '';

  const nameValid = name.trim().length >= 2;
  // Email is optional in this step — but if provided, must be well-formed.
  const emailValid =
    email.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    setValid(nameValid && emailValid);
  }, [nameValid, emailValid, setValid]);

  return (
    <div className="flex flex-col gap-4">
      {/* Name */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.5px] uppercase text-gray-700/75">
          Full name
        </span>
        <input
          data-autofocus
          type="text"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Utkarsh Kumar"
          maxLength={80}
          autoComplete="name"
          className="w-full h-12 px-4 rounded-2xl text-[14px] font-medium text-[#0F2452] bg-white/70 border-[1.5px] border-[#0F2452]/20 outline-none focus:bg-white focus:border-[#0F2452] focus:ring-4 focus:ring-[#0F2452]/15 transition-all"
          aria-invalid={!nameValid && name.length > 0}
        />
        {name.length > 0 && !nameValid && (
          <span className="text-[11.5px] text-red-500 mt-0.5">
            Please enter at least 2 characters.
          </span>
        )}
      </label>

      {/* Email (optional) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.5px] uppercase text-gray-700/75 flex items-center justify-between">
          <span>Email</span>
          <span className="normal-case font-normal text-[11px] tracking-normal text-gray-700/50">
            optional
          </span>
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="you@example.com"
          maxLength={120}
          autoComplete="email"
          inputMode="email"
          className="w-full h-12 px-4 rounded-2xl text-[14px] font-medium text-[#0F2452] bg-white/70 border-[1.5px] border-[#0F2452]/20 outline-none focus:bg-white focus:border-[#0F2452] focus:ring-4 focus:ring-[#0F2452]/15 transition-all"
          aria-invalid={!emailValid}
        />
        {!emailValid && (
          <span className="text-[11.5px] text-red-500 mt-0.5">
            That email doesn&apos;t look quite right.
          </span>
        )}
      </label>

      {/*
        TODO(product): additional identity fields (avatar upload, DOB, etc.)
        will slot in here. The pattern above is the template — each field is
        a local derived value + onChange + a validity contribution.
      */}
    </div>
  );
}
