'use client';

/**
 * Step 6 — Weekly availability.
 *
 * We model availability as a list of recurring (dayOfWeek, start, end) slots
 * with an optional `isBreak` flag for lunch / prayer breaks. The matcher on
 * the booking side subtracts break windows from available windows, so it's
 * fine for breaks to sit inside larger available windows — in fact that's
 * the whole point.
 *
 * UX notes:
 *   · Time pickers use native <input type="time"> — works offline, handles
 *     locale 12h/24h display, and older users recognise it.
 *   · We check for overlaps within the same day (breaks overlap breaks,
 *     available overlap available). Breaks are allowed to be fully inside
 *     an available window; that's not an error.
 *   · "Copy to all days" is a power feature — providers who hold the same
 *     hours Mon-Fri shouldn't have to enter them five times.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import {
  providerOnboardingApi,
  type AvailabilitySlot,
} from '@/lib/provider-onboarding-api';

const DAYS: Array<{ idx: number; short: string; full: string }> = [
  { idx: 0, short: 'Sun', full: 'Sunday' },
  { idx: 1, short: 'Mon', full: 'Monday' },
  { idx: 2, short: 'Tue', full: 'Tuesday' },
  { idx: 3, short: 'Wed', full: 'Wednesday' },
  { idx: 4, short: 'Thu', full: 'Thursday' },
  { idx: 5, short: 'Fri', full: 'Friday' },
  { idx: 6, short: 'Sat', full: 'Saturday' },
];

interface DraftSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function hhmmToMin(t: string): number {
  if (!/^\d{2}:\d{2}$/.test(t)) return NaN;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(a: DraftSlot, b: DraftSlot): boolean {
  const as = hhmmToMin(a.startTime);
  const ae = hhmmToMin(a.endTime);
  const bs = hhmmToMin(b.startTime);
  const be = hhmmToMin(b.endTime);
  return as < be && bs < ae;
}

function validateDay(slots: DraftSlot[]): string[] {
  const errs: string[] = [];
  const avails = slots.filter((s) => !s.isBreak);
  const breaks = slots.filter((s) => s.isBreak);

  for (const s of slots) {
    const start = hhmmToMin(s.startTime);
    const end = hhmmToMin(s.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errs.push('Every slot needs a start and end time.');
      continue;
    }
    if (end <= start) errs.push('End time must be after start time.');
    if (end - start < 15) errs.push('Each slot must be at least 15 minutes long.');
  }

  // Available windows must not overlap each other.
  for (let i = 0; i < avails.length; i++) {
    for (let j = i + 1; j < avails.length; j++) {
      if (overlaps(avails[i], avails[j])) {
        errs.push('Available windows are overlapping. Merge them or split the break.');
        break;
      }
    }
  }

  // Breaks must live inside some available window.
  for (const b of breaks) {
    const inside = avails.some(
      (a) =>
        hhmmToMin(a.startTime) <= hhmmToMin(b.startTime) &&
        hhmmToMin(b.endTime) <= hhmmToMin(a.endTime),
    );
    if (!inside) {
      errs.push('Breaks must sit inside an available window.');
      break;
    }
  }

  return Array.from(new Set(errs));
}

export default function Step6Page() {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const [slots, setSlots] = useState<DraftSlot[]>(() =>
    (data.slots ?? []).map((s) => ({ ...s, id: uid() })),
  );
  const [err, setErr] = useState<string | null>(null);

  /* Gate */
  useEffect(() => {
    if (!data.religion) router.replace('/provider-onboarding/step-3');
    else if (!data.pricing?.length) router.replace('/provider-onboarding/step-5');
  }, [data.religion, data.pricing, router]);

  /* Sync */
  useEffect(() => {
    const wire: AvailabilitySlot[] = slots.map(({ id: _id, ...rest }: DraftSlot) => rest);
    update({ slots: wire });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  /* Group by day for rendering + per-day validation */
  const byDay = useMemo(() => {
    const m = new Map<number, DraftSlot[]>();
    for (const d of DAYS) m.set(d.idx, []);
    for (const s of slots) m.get(s.dayOfWeek)?.push(s);
    return m;
  }, [slots]);

  const perDayErrors = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const d of DAYS) m.set(d.idx, validateDay(byDay.get(d.idx) ?? []));
    return m;
  }, [byDay]);

  const totalSlots = slots.length;
  const hasAvailable = slots.some((s: any) => !s.isBreak);
  const anyErrors = Array.from<string[]>(perDayErrors.values()).some((e) => e.length > 0);
  const canContinue = hasAvailable && !anyErrors;

  /* Actions */
  const addSlot = (dayIdx: number, isBreak = false) =>
    setSlots((cur: any) => [
      ...cur,
      {
        id: uid(),
        dayOfWeek: dayIdx,
        startTime: isBreak ? '13:00' : '09:00',
        endTime: isBreak ? '14:00' : '12:00',
        isBreak: isBreak || undefined,
      },
    ]);

  const updateSlot = (id: string, patch: Partial<DraftSlot>) =>
    setSlots((cur: any) => cur.map((s: any) => (s.id === id ? { ...s, ...patch } : s)));

  const removeSlot = (id: string) =>
    setSlots((cur: any) => cur.filter((s: any) => s.id !== id));

  const copyToAllDays = (dayIdx: number) => {
    const source = (byDay.get(dayIdx) ?? []).map((s: any) => ({
      ...s,
      id: undefined as unknown as string,
    }));
    if (!source.length) return;
    const ok = confirm(
      `Copy ${source.length} slot${source.length > 1 ? 's' : ''} from ${
        DAYS[dayIdx].full
      } to every other day? This will replace those days' schedules.`,
    );
    if (!ok) return;
    setSlots(() =>
      DAYS.flatMap((d) =>
        source.map((s: any) => ({
          id: uid(),
          dayOfWeek: d.idx,
          startTime: s.startTime,
          endTime: s.endTime,
          isBreak: s.isBreak,
        })),
      ),
    );
  };

  const clearDay = (dayIdx: number) =>
    setSlots((cur: any) => cur.filter((s: any) => s.dayOfWeek !== dayIdx));

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
      await providerOnboardingApi.step6({
        slots: slots.map(({ id: _id, ...rest }: DraftSlot) => rest),
      });
      advance(7);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save schedule.');
      throw e;
    }
  };

  return (
    <WizardShell
      currentStep={6}
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel={
        !hasAvailable
          ? 'Add at least one available slot'
          : anyErrors
          ? 'Fix schedule issues'
          : `Save & Continue (${totalSlots} slots)`
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700/80">
          Tell us when you're generally free. Devotees will only be able to
          book during your available windows — minus any breaks you set.
        </p>

        {DAYS.map((d) => {
          const daySlots = byDay.get(d.idx) ?? [];
          const errs = perDayErrors.get(d.idx) ?? [];
          return (
            <section
              key={d.idx}
              className="rounded-2xl border border-[#0F2452]/15 bg-white overflow-hidden"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-[#0F2452]/10 bg-[#0F2452]/[0.03]">
                <div>
                  <p className="font-semibold text-gray-700">{d.full}</p>
                  <p className="text-xs text-gray-700/60">
                    {daySlots.length === 0
                      ? 'Day off'
                      : `${daySlots.filter((s: any) => !s.isBreak).length} window${
                          daySlots.filter((s: any) => !s.isBreak).length === 1 ? '' : 's'
                        }${
                          daySlots.some((s: any) => s.isBreak)
                            ? ` · ${daySlots.filter((s: any) => s.isBreak).length} break`
                            : ''
                        }`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {daySlots.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyToAllDays(d.idx)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-[#0F2452]/10 text-gray-700 hover:bg-[#0F2452]/15"
                      >
                        Copy to all
                      </button>
                      <button
                        type="button"
                        onClick={() => clearDay(d.idx)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </header>

              <div className="p-3 space-y-2">
                {daySlots.map((s: any) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 rounded-xl p-2 border
                      ${
                        s.isBreak
                          ? 'bg-[#FBF8F3] border-[#0F2452]/15'
                          : 'bg-white border-[#0F2452]/15'
                      }`}
                  >
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full font-semibold
                        ${
                          s.isBreak
                            ? 'bg-[#EDD9A8]/60 text-gray-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                    >
                      {s.isBreak ? 'Break' : 'Open'}
                    </span>
                    <input
                      type="time"
                      value={s.startTime}
                      onChange={(e) => updateSlot(s.id, { startTime: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-[#0F2452]/20 bg-white text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40"
                    />
                    <span className="text-gray-700/50 text-sm">→</span>
                    <input
                      type="time"
                      value={s.endTime}
                      onChange={(e) => updateSlot(s.id, { endTime: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-[#0F2452]/20 bg-white text-sm
                                 focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(s.id)}
                      aria-label="Remove slot"
                      className="text-gray-700/50 hover:text-red-600 text-lg px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => addSlot(d.idx, false)}
                    className="flex-1 text-sm px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                  >
                    + Available window
                  </button>
                  <button
                    type="button"
                    onClick={() => addSlot(d.idx, true)}
                    className="flex-1 text-sm px-3 py-2 rounded-lg bg-[#FBF8F3] text-gray-700 hover:bg-[#F6F7FA] border border-[#C8932A]/30"
                    disabled={daySlots.filter((s: any) => !s.isBreak).length === 0}
                  >
                    + Break
                  </button>
                </div>

                {errs.length > 0 && (
                  <ul className="mt-2 text-xs text-red-700 list-disc pl-5 space-y-0.5">
                    {errs.map((e: any) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}

        {!hasAvailable && (
          <p className="text-xs text-gray-700/70 italic">
            Add at least one open window on any day to continue.
          </p>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}
