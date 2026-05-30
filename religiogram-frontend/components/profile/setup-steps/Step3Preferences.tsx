'use client';

import { useEffect } from 'react';
import type { StepProps } from '../ProfileSetupWizard';

/**
 * Step 3 — Preferences (placeholder, optional).
 *
 * The last step is intentionally lightweight so the wizard doesn't end
 * on a wall of required inputs. A tap or two here and the user is done.
 *
 * Placeholder preferences:
 *   - Interests — multi-select chips.
 *   - Notifications — on/off toggle (default on).
 *
 * Real fields will land with product sign-off; the pattern above (chips
 * + toggles) is the template.
 */

const INTERESTS = [
  'Puja & Rituals',
  'Meditation',
  'Astrology',
  'Vaastu',
  'Festivals',
  'Discourses',
  'Pilgrimage',
];

export default function Step3Preferences({ data, onChange, setValid }: StepProps) {
  const interests = Array.isArray(data.interests)
    ? (data.interests as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const notificationsEnabled =
    typeof data.notificationsEnabled === 'boolean' ? data.notificationsEnabled : true;

  // Optional step — always valid, user can finish with nothing selected.
  useEffect(() => {
    setValid(true);
  }, [setValid]);

  const toggleInterest = (label: string) => {
    const has = interests.includes(label);
    const next = has ? interests.filter((l) => l !== label) : [...interests, label];
    onChange({ interests: next });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Interests */}
      <div>
        <div className="text-[12px] font-semibold tracking-[0.5px] uppercase text-gray-700/75 mb-1">
          Interests
        </div>
        <p className="text-[11.5px] text-gray-700/55 mb-2.5">
          Pick a few — we&apos;ll tailor your feed. You can change these later.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Interests">
          {INTERESTS.map((label, i) => {
            const selected = interests.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleInterest(label)}
                {...(i === 0 ? { 'data-autofocus': true } : {})}
                className="px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all"
                style={{
                  background: selected ? 'rgba(169,113,66,.15)' : 'rgba(255,252,245,.7)',
                  color: selected ? '#0F2452' : '#5C3820',
                  border: `1.5px solid ${selected ? '#C8932A' : 'rgba(197,138,75,.2)'}`,
                }}
                aria-pressed={selected}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications toggle */}
      <div
        className="flex items-center justify-between gap-4 p-3.5 rounded-2xl"
        style={{
          background: 'rgba(255,252,245,.7)',
          border: '1.5px solid rgba(197,138,75,.18)',
        }}
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[#0F2452]">
            Allow notifications
          </div>
          <p className="text-[11.5px] text-gray-700/55 mt-0.5 leading-snug">
            Booking reminders and festival alerts. You can change this in Settings.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={notificationsEnabled}
          onClick={() =>
            onChange({ notificationsEnabled: !notificationsEnabled })
          }
          className="relative flex-shrink-0 w-12 h-7 rounded-full transition-all"
          style={{
            background: notificationsEnabled
              ? 'linear-gradient(135deg,#C8932A,#C8932A)'
              : 'rgba(169,113,66,.2)',
            boxShadow: notificationsEnabled
              ? 'inset 0 1px 0 rgba(255,255,255,.2), 0 2px 8px rgba(169,113,66,.3)'
              : 'inset 0 1px 2px rgba(107,63,29,.15)',
          }}
        >
          <span
            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-all"
            style={{
              left: notificationsEnabled ? 'calc(100% - 26px)' : '2px',
              boxShadow: '0 2px 4px rgba(107,63,29,.2)',
            }}
          />
        </button>
      </div>

      {/*
        TODO(product): language preference, default faith/tradition filter,
        radius for "near me" — each slots in as another chip group or toggle.
      */}
    </div>
  );
}
