'use client';

/**
 * Step — Astrology + spiritual specialisations (astrologer + both flows).
 *
 * ~40 specialisations grouped into 5 categories so the picker doesn't feel
 * overwhelming. A search bar at the top does a fuzzy substring filter over
 * every name so power users don't have to scan the whole grid.
 *
 * Persistence:
 *   Selected slugs are saved to `data.specialisations` as string[] — the same
 *   contract the backend accepts today. When we later add a specialisations
 *   master table (Phase 3) we swap the constants below for an API fetch and
 *   the wire format stays the same.
 *
 * We store the *display label* (e.g. "Vedic Astrology"), not a slug, because
 * the marketplace lists this text directly under the astrologer's name. If
 * you rename anything below, add the old label as an alias in the master
 * table migration so existing providers don't lose their badges.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { providerOnboardingApi } from '@/lib/provider-onboarding-api';
import type { FlowConfig } from './FlowConfig';

/* ─────────── Master list ─────────── */

type Category = {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  items: string[];
};

const CATEGORIES: Category[] = [
  {
    key: 'astrology',
    label: 'Astrology Systems',
    icon: '✦',
    blurb: 'Core astrology traditions and schools',
    items: [
      'Vedic Astrology',
      'KP Astrology',
      'Nadi Astrology',
      'Western Astrology',
      'Lal Kitab',
      'Prashna Astrology',
      'Horary Astrology',
      'Jaimini Astrology',
      'Bhrigu Astrology',
      'Medical Astrology',
      'Financial Astrology',
      'Business Astrology',
      'Career Astrology',
      'Marriage Astrology',
      'Relationship Astrology',
      'Child Astrology',
      'Health Astrology',
      'Electional Astrology',
      'Muhurat Expert',
      'Horoscope Expert',
      'Kundli Expert',
      'Match Making Expert',
      'Dosha Expert',
    ],
  },
  {
    key: 'divination',
    label: 'Divination & Reading',
    icon: '◈',
    blurb: 'Card, symbol, and pattern-based reading',
    items: [
      'Tarot Reading',
      'Numerology',
      'Palmistry',
      'Face Reading',
      'Angel Card Reading',
      'Oracle Card Reading',
      'Dream Interpretation',
      'Signature Analysis',
    ],
  },
  {
    key: 'healing',
    label: 'Healing',
    icon: '❁',
    blurb: 'Energy-based healing modalities',
    items: [
      'Reiki Healing',
      'Chakra Healing',
      'Crystal Healing',
      'Gemstone Consultation',
      'Rudraksha Consultation',
    ],
  },
  {
    key: 'home_energy',
    label: 'Home & Energy',
    icon: '⌂',
    blurb: 'Space, direction, and energy arrangement',
    items: [
      'Vastu Shastra',
      'Feng Shui',
    ],
  },
  {
    key: 'spiritual',
    label: 'Spiritual Guidance',
    icon: '☾',
    blurb: 'Personal spiritual practice and counsel',
    items: [
      'Meditation Guidance',
      'Manifestation Guidance',
      'Spiritual Counselling',
    ],
  },
];

/* All items flat, for search matching. */
const ALL_ITEMS = CATEGORIES.flatMap((c) => c.items);

function fuzzyMatch(hay: string, needle: string): boolean {
  if (!needle) return true;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (h.includes(n)) return true;
  // token-order-insensitive: "vedic tarot" matches nothing (right), but
  // "tarot read" matches "Tarot Reading" via includes above.
  return false;
}

/* ─────────── Component ─────────── */

/* Experience bands. Store `low` (the min of the band) as the years value on
 * the provider row — small integer, easy to sort/filter later. */
const YEARS_BANDS: { label: string; low: number }[] = [
  { label: '1–3 yrs',  low: 1  },
  { label: '4–9 yrs',  low: 4  },
  { label: '10–19 yrs', low: 10 },
  { label: '20+ yrs',  low: 20 },
];

/** Snap any integer to the band-low that represents its range. */
function bandLowFromYears(y: number | undefined): number | null {
  if (typeof y !== 'number' || !Number.isFinite(y) || y < 1) return null;
  if (y >= 20) return 20;
  if (y >= 10) return 10;
  if (y >= 4)  return 4;
  return 1;
}

export default function Step_Specialisations({ flow }: { flow: FlowConfig }) {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();
  const [picks, setPicks] = useState<string[]>(data.specialisations ?? []);
  const [years, setYears] = useState<Record<string, number>>(
    data.specialisationYears ?? {},
  );
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  /* Every change to picks or years flows back into the store. We prune the
   * years map of any keys that aren't in the current picks list — otherwise
   * unpicking a spec would leave a stale years entry that the backend would
   * later filter out at submit, but locally it'd look wrong. */
  useEffect(() => {
    const pickedSet = new Set(picks);
    const prunedYears: Record<string, number> = {};
    for (const [k, v] of Object.entries(years)) {
      if (pickedSet.has(k)) prunedYears[k] = v;
    }
    update({ specialisations: picks, specialisationYears: prunedYears });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, years]);

  const toggle = (s: string) =>
    setPicks((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  const setBand = (s: string, low: number) =>
    setYears((cur) => ({ ...cur, [s]: low }));

  const clearAll = () => { setPicks([]); setYears({}); };

  /* Filter each category by query — a category with zero visible items is
   * hidden entirely so the user isn't left with empty section headers. */
  const filteredCategories = useMemo(() => {
    if (!query.trim()) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => fuzzyMatch(i, query)),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const totalVisible = useMemo(
    () => filteredCategories.reduce((n, c) => n + c.items.length, 0),
    [filteredCategories],
  );

  /* If the user searches, auto-expand any collapsed category that matches so
   * the results are immediately visible. */
  const isCollapsed = (key: string) =>
    query.trim() ? false : !!collapsed[key];

  /* Require: at least one pick AND every pick has a years band selected.
   * Without a years pick the badge on the marketplace would just show the
   * name — feels half-done. Users see "Pick your experience below" hint on
   * any pick that's still missing a band. */
  const allHaveYears = picks.every((p) => bandLowFromYears(years[p]) !== null);
  const canContinue = picks.length >= 1 && allHaveYears;
  const missingYearsCount = picks.filter((p) => bandLowFromYears(years[p]) === null).length;

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
      nextLabel={
        picks.length === 0
          ? 'Pick at least one'
          : missingYearsCount > 0
            ? `Add experience (${missingYearsCount} left)`
            : `Save & Continue (${picks.length})`
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700/85">
          Which systems do you practise? Devotees see these alongside your
          name so they can find the right guide.
        </p>

        {/* Search */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base"
          >
            ⌕
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search specialisation…"
            className="w-full pl-9 pr-9 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base
                       focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40 focus:border-[#0F2452]/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-gray-500 hover:bg-[#0F2452]/5 flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>

        {/* Selected summary — each pick expands to a years band picker */}
        {picks.length > 0 && (
          <div className="rounded-2xl bg-[#0F2452]/[0.04] border border-[#0F2452]/15 p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold tracking-wide uppercase text-[#0F2452]/70">
                Your practices · {picks.length}
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-[#0F2452]/70 hover:text-[#0F2452] underline underline-offset-2"
              >
                Clear all
              </button>
            </div>
            <ul className="space-y-2.5">
              {picks.map((p) => {
                const currentLow = bandLowFromYears(years[p]);
                return (
                  <li key={p} className="rounded-xl bg-white/70 border border-[#0F2452]/10 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0F2452] flex items-center gap-1.5">
                          <span aria-hidden className="text-green-700">✓</span>
                          <span className="truncate">{p}</span>
                        </p>
                        <p className="text-[11px] text-gray-700/65 mt-0.5">
                          {currentLow === null
                            ? 'Pick your experience below'
                            : 'Your experience in this practice'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(p)}
                        aria-label={`Remove ${p}`}
                        className="w-7 h-7 rounded-full text-gray-500 hover:bg-[#0F2452]/5 flex items-center justify-center text-sm flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {YEARS_BANDS.map((b) => {
                        const on = currentLow === b.low;
                        return (
                          <button
                            type="button"
                            key={b.low}
                            onClick={() => setBand(p, b.low)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition
                              ${
                                on
                                  ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                                  : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                              }`}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Categorised list */}
        <div className="space-y-3">
          {filteredCategories.map((cat) => {
            const catCollapsed = isCollapsed(cat.key);
            const catPickedCount = cat.items.filter((i) => picks.includes(i)).length;
            return (
              <section key={cat.key} className="rounded-2xl border border-[#0F2452]/15 bg-white/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [cat.key]: !c[cat.key] }))}
                  disabled={!!query.trim()}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#0F2452]/[0.03] transition disabled:cursor-default"
                >
                  <span aria-hidden className="text-lg text-amber-700 flex-shrink-0 w-6 text-center">{cat.icon}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-[#0F2452] flex items-center gap-2">
                      {cat.label}
                      {catPickedCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-700 text-[#F7EFE1]">
                          {catPickedCount}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-700/65">{cat.blurb}</p>
                  </div>
                  {!query.trim() && (
                    <span
                      aria-hidden
                      className={`text-[#0F2452]/60 text-lg transition-transform ${catCollapsed ? '' : 'rotate-180'}`}
                    >
                      ⌄
                    </span>
                  )}
                </button>

                {!catCollapsed && (
                  <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2">
                    {cat.items.map((s) => {
                      const on = picks.includes(s);
                      return (
                        <button
                          type="button"
                          key={s}
                          onClick={() => toggle(s)}
                          className={`px-3.5 py-2 rounded-full text-sm border transition
                            ${
                              on
                                ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                                : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                            }`}
                        >
                          {highlightMatch(s, query)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          {query.trim() && totalVisible === 0 && (
            <div className="text-center py-8 text-sm text-gray-700/70">
              No matches for &ldquo;{query}&rdquo;. Try a shorter word.
            </div>
          )}
        </div>

        <p className="text-xs text-gray-700/60 pt-1">
          Pick every system you&apos;re confident consulting on. You can
          adjust these later from your profile settings.
        </p>

        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </WizardShell>
  );
}

/* ─────────── Helpers ─────────── */

/**
 * Bolds the matched substring inside a specialisation label so search results
 * are legible at a glance. Case-insensitive; leaves the rest of the label
 * untouched.
 */
function highlightMatch(label: string, q: string): React.ReactNode {
  const query = q.trim();
  if (!query) return label;
  const i = label.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return label;
  return (
    <>
      {label.slice(0, i)}
      <span className="font-bold">{label.slice(i, i + query.length)}</span>
      {label.slice(i + query.length)}
    </>
  );
}
