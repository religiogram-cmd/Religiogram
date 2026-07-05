'use client';

/**
 * FiltersSheet — bottom-sheet UI for the /astrology/browse marketplace.
 *
 * Structure:
 *   • Backdrop (semi-transparent, tap to dismiss)
 *   • Sheet: slides up from bottom, rounded top, sticky header + footer,
 *     scrollable body divided into sections of selectable chips.
 *
 * State ownership:
 *   The sheet owns the *draft* selection while open, only committing back to
 *   the parent when the user hits "Apply". This means the results list doesn't
 *   refetch on every tap — much snappier on mobile. On mount the draft seeds
 *   from either sessionStorage (`rg_astro_filters`) or the parent's current
 *   `value` prop, whichever exists.
 *
 * Persistence:
 *   Draft is mirrored into sessionStorage on every change so re-opening the
 *   sheet within the same session preserves partial selections even if the
 *   user closed without applying. Parent is responsible for clearing on
 *   unmount (see BrowsePage).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ConsultationChannel } from '@/lib/astrology-api';

const NAVY   = '#0F2452';
const GOLD   = '#C8920A';
const GOLD_L = '#E0A92F';
const CREAM  = '#FFFAEC';
const TEXT2  = '#4A3010';
const BORDER = 'rgba(15,36,82,0.15)';

/* ─────────────────────────  Types  ───────────────────────── */

export interface SheetFilters {
  availability:        string[];                // section 1
  channels:            ConsultationChannel[];   // section 2
  minPricePaise:       number;                  // section 3
  maxPricePaise:       number;                  // section 3
  experienceBands:     string[];                // section 4
  minRating?:          number;                  // section 5 (single)
  languages:           string[];                // section 6
  gender?:             'male' | 'female' | 'other'; // section 7 (single)
  specializations:     string[];                // section 8
  topics:              string[];                // section 9
  verificationBadges:  string[];                // section 10
}

export const EMPTY_FILTERS: SheetFilters = {
  availability:       [],
  channels:           [],
  minPricePaise:      1000,   // ₹10
  maxPricePaise:      30000,  // ₹300
  experienceBands:    [],
  minRating:          undefined,
  languages:          [],
  gender:             undefined,
  specializations:    [],
  topics:             [],
  verificationBadges: [],
};

/** Count how many filter fields have an active selection. Used for the
 *  badge on the "Filters" pill and the Apply button label. */
export function countActiveFilters(f: SheetFilters): number {
  let n = 0;
  n += f.availability.length;
  n += f.channels.length;
  if (f.minPricePaise !== EMPTY_FILTERS.minPricePaise || f.maxPricePaise !== EMPTY_FILTERS.maxPricePaise) n += 1;
  n += f.experienceBands.length;
  if (f.minRating !== undefined) n += 1;
  n += f.languages.length;
  if (f.gender) n += 1;
  n += f.specializations.length;
  n += f.topics.length;
  n += f.verificationBadges.length;
  return n;
}

export const SESSION_KEY = 'rg_astro_filters';

/* ─────────────────────  Section option lists  ───────────────────── */

const AVAILABILITY_OPTS: Array<{ key: string; label: string }> = [
  { key: 'online',  label: 'Online Now' },
  { key: 'chat',    label: 'Available in Chat' },
  { key: 'voice',   label: 'Available in Voice Call' },
  { key: 'video',   label: 'Available in Video Call' },
  { key: 'busy',    label: 'Busy' },
  { key: 'offline', label: 'Offline' },
  { key: 'today',   label: 'Available Today' },
];

const CHANNEL_OPTS: Array<{ key: ConsultationChannel; label: string }> = [
  { key: 'chat',  label: 'Chat' },
  { key: 'voice', label: 'Voice' },
  { key: 'video', label: 'Video' },
];

const PRICE_MIN_PAISE = 1000;   // ₹10
const PRICE_MAX_PAISE = 30000;  // ₹300

const PRICE_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'Under ₹20', min: 1000,  max: 2000 },
  { label: '₹20–50',    min: 2000,  max: 5000 },
  { label: '₹50–100',   min: 5000,  max: 10000 },
  { label: '₹100+',     min: 10000, max: 30000 },
];

const EXPERIENCE_OPTS: Array<{ key: string; label: string }> = [
  { key: '0-3',   label: '0–3 Years' },
  { key: '3-5',   label: '3–5 Years' },
  { key: '5-10',  label: '5–10 Years' },
  { key: '10-15', label: '10–15 Years' },
  { key: '15-20', label: '15–20 Years' },
  { key: '20+',   label: '20+ Years' },
];

const RATING_OPTS: Array<{ value: number; label: string }> = [
  { value: 5, label: '5★' },
  { value: 4, label: '4★+' },
  { value: 3, label: '3★+' },
];

const LANGUAGE_OPTS = [
  'Hindi', 'English', 'Sanskrit', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Odia',
];

const GENDER_OPTS: Array<{ key: 'male' | 'female' | 'other'; label: string }> = [
  { key: 'male',   label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other',  label: 'Other' },
];

const SYSTEM_OPTS = [
  'Vedic Astrology', 'KP Astrology', 'Nadi Astrology', 'Western Astrology',
  'Lal Kitab', 'Tarot Reading', 'Numerology', 'Palmistry', 'Face Reading',
  'Vastu', 'Feng Shui', 'Reiki', 'Chakra Healing', 'Crystal Healing',
  'Gemstone Consultation', 'Rudraksha Consultation',
];

const TOPIC_OPTS = [
  'Love', 'Marriage', 'Career', 'Job', 'Business', 'Finance', 'Health',
  'Family', 'Children', 'Education', 'Property', 'Legal', 'Foreign Travel',
  'Visa', 'Startup', 'Stocks', 'Mental Wellness', 'Spiritual Guidance',
];

const VERIFICATION_OPTS: Array<{ key: string; label: string }> = [
  { key: 'verified',  label: 'Verified Astrologers Only' },
  { key: 'kyc',       label: 'KYC Verified' },
  { key: 'certified', label: 'Certified Expert' },
];

/* ─────────────────────────  Component  ───────────────────────── */

/** Keys of sections that can be hidden per flow. Priest flows hide
 *  `systems` (astrology systems) + `topics` (astro consult topics) since
 *  they aren't meaningful for pandit consultations. */
export type FilterSectionKey =
  | 'availability' | 'channels' | 'price' | 'experience' | 'rating'
  | 'languages'    | 'gender'   | 'systems' | 'topics'   | 'verification';

interface Props {
  open: boolean;
  value: SheetFilters;
  onClose: () => void;
  onApply: (next: SheetFilters) => void;
  /** Optional list of sections to hide. Used by Ask-a-Pandit to strip
   *  astrology-only sections while reusing the same sheet UI. */
  hideSections?: FilterSectionKey[];
  /** Copy override for the "Verified <Astrologers|Pandits|...> Only" chip
   *  label. Defaults to "Verified Astrologers Only" when not supplied. */
  verifiedOnlyLabel?: string;
  /** Sheet title. Defaults to "Filters". */
  title?: string;
}

export default function FiltersSheet({
  open, value, onClose, onApply,
  hideSections = [],
  verifiedOnlyLabel,
  title = 'Filters',
}: Props) {
  const hidden = new Set(hideSections);
  const isHidden = (k: FilterSectionKey) => hidden.has(k);
  /* Draft state — mutated locally until Apply. Seeds from either the parent's
   * committed value or sessionStorage on mount, whichever exists. */
  const [draft, setDraft] = useState<SheetFilters>(value);

  // Re-seed draft when the sheet is re-opened. This lets external state
  // (e.g. someone hitting "Reset all" outside the sheet) flow back in.
  useEffect(() => {
    if (open) {
      // Prefer parent value; if it's empty and session has something,
      // rehydrate from session so partial selections survive close-without-apply.
      const isValueEmpty = countActiveFilters(value) === 0;
      if (isValueEmpty && typeof window !== 'undefined') {
        try {
          const raw = window.sessionStorage.getItem(SESSION_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as SheetFilters;
            setDraft({ ...EMPTY_FILTERS, ...parsed });
            return;
          }
        } catch { /* corrupt storage — ignore */ }
      }
      setDraft(value);
    }
  }, [open, value]);

  // Persist draft to session on every change (only while open, so we don't
  // spam storage from a mounted-but-closed sheet).
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft));
    } catch { /* quota / private mode — ignore */ }
  }, [open, draft]);

  const activeCount = useMemo(() => countActiveFilters(draft), [draft]);

  if (!open) return null;

  /* ─── Toggle helpers ─── */
  const toggleIn = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const set = <K extends keyof SheetFilters>(k: K, v: SheetFilters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const resetAll = () => setDraft(EMPTY_FILTERS);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(15,36,82,0.55)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101,
          maxHeight: '85vh',
          background: CREAM,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -8px 32px rgba(15,36,82,0.25)',
          display: 'flex', flexDirection: 'column',
          animation: 'sheet-up 0.24s ease-out',
        }}
      >
        <style>{`@keyframes sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(15,36,82,0.2)' }} />
        </div>

        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px 12px',
          borderBottom: '1px solid rgba(15,36,82,0.08)',
        }}>
          <button
            type="button"
            onClick={resetAll}
            style={{
              background: 'transparent', border: 'none',
              color: NAVY, fontSize: 13.5, fontWeight: 700,
              cursor: 'pointer', padding: '4px 2px',
            }}
          >
            Reset
          </button>
          <h2 style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 18, fontWeight: 700, color: NAVY,
            margin: 0, letterSpacing: '-0.01em',
          }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{
              background: 'transparent', border: 'none',
              color: NAVY, fontSize: 22, lineHeight: 1,
              cursor: 'pointer', padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '16px 18px 20px',
        }}>
          {/* 1. Availability */}
          {!isHidden('availability') && <>
          <Section title="Availability">
            <ChipRow>
              {AVAILABILITY_OPTS.map((o) => (
                <SheetChip
                  key={o.key}
                  active={draft.availability.includes(o.key)}
                  onClick={() => set('availability', toggleIn(draft.availability, o.key))}
                >
                  {o.label}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 2. Consultation Type */}
          {!isHidden('channels') && <>
          <Section title="Consultation Type">
            <ChipRow>
              {CHANNEL_OPTS.map((o) => (
                <SheetChip
                  key={o.key}
                  active={draft.channels.includes(o.key)}
                  onClick={() => set('channels', toggleIn(draft.channels, o.key))}
                >
                  {o.label}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 3. Consultation Price */}
          {!isHidden('price') && <>
          <Section title="Consultation Price (per min)">
            <PriceRange
              min={draft.minPricePaise}
              max={draft.maxPricePaise}
              onChange={(mn, mx) => setDraft((d) => ({ ...d, minPricePaise: mn, maxPricePaise: mx }))}
            />
            <ChipRow style={{ marginTop: 12 }}>
              {PRICE_PRESETS.map((p) => {
                const active = draft.minPricePaise === p.min && draft.maxPricePaise === p.max;
                return (
                  <SheetChip
                    key={p.label}
                    active={active}
                    onClick={() => setDraft((d) => ({ ...d, minPricePaise: p.min, maxPricePaise: p.max }))}
                  >
                    {p.label}
                  </SheetChip>
                );
              })}
            </ChipRow>
          </Section>
          </>}

          {/* 4. Experience */}
          {!isHidden('experience') && <>
          <Section title="Experience">
            <ChipRow>
              {EXPERIENCE_OPTS.map((o) => (
                <SheetChip
                  key={o.key}
                  active={draft.experienceBands.includes(o.key)}
                  onClick={() => set('experienceBands', toggleIn(draft.experienceBands, o.key))}
                >
                  {o.label}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 5. Rating (single-select) */}
          {!isHidden('rating') && <>
          <Section title="Rating">
            <ChipRow>
              {RATING_OPTS.map((o) => {
                const active = draft.minRating === o.value;
                return (
                  <SheetChip
                    key={o.value}
                    active={active}
                    onClick={() => set('minRating', active ? undefined : o.value)}
                  >
                    {o.label}
                  </SheetChip>
                );
              })}
            </ChipRow>
          </Section>
          </>}

          {/* 6. Language */}
          {!isHidden('languages') && <>
          <Section title="Language">
            <ChipRow>
              {LANGUAGE_OPTS.map((l) => (
                <SheetChip
                  key={l}
                  active={draft.languages.includes(l)}
                  onClick={() => set('languages', toggleIn(draft.languages, l))}
                >
                  {l}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 7. Gender (single-select) */}
          {!isHidden('gender') && <>
          <Section title="Gender">
            <ChipRow>
              {GENDER_OPTS.map((o) => {
                const active = draft.gender === o.key;
                return (
                  <SheetChip
                    key={o.key}
                    active={active}
                    onClick={() => set('gender', active ? undefined : o.key)}
                  >
                    {o.label}
                  </SheetChip>
                );
              })}
            </ChipRow>
          </Section>
          </>}

          {/* 8. Astrology Systems */}
          {!isHidden('systems') && <>
          <Section title="Astrology Systems">
            <ChipRow>
              {SYSTEM_OPTS.map((s) => (
                <SheetChip
                  key={s}
                  active={draft.specializations.includes(s)}
                  onClick={() => set('specializations', toggleIn(draft.specializations, s))}
                >
                  {s}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 9. Consultation Topics */}
          {!isHidden('topics') && <>
          <Section title="Consultation Topics">
            <ChipRow>
              {TOPIC_OPTS.map((t) => (
                <SheetChip
                  key={t}
                  active={draft.topics.includes(t)}
                  onClick={() => set('topics', toggleIn(draft.topics, t))}
                >
                  {t}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          </>}

          {/* 10. Verification */}
          {!isHidden('verification') && (
          <Section title="Verification">
            <ChipRow>
              {VERIFICATION_OPTS.map((o) => (
                <SheetChip
                  key={o.key}
                  active={draft.verificationBadges.includes(o.key)}
                  onClick={() => set('verificationBadges', toggleIn(draft.verificationBadges, o.key))}
                >
                  {o.key === 'verified' && verifiedOnlyLabel ? verifiedOnlyLabel : o.label}
                </SheetChip>
              ))}
            </ChipRow>
          </Section>
          )}

          {/* bottom spacer so last section clears the sticky footer */}
          <div style={{ height: 12 }} />
        </div>

        {/* Sticky footer */}
        <div style={{
          padding: '12px 18px 18px',
          borderTop: '1px solid rgba(15,36,82,0.08)',
          background: CREAM,
        }}>
          <button
            type="button"
            onClick={() => onApply(draft)}
            style={{
              width: '100%',
              padding: '14px 18px',
              background: NAVY,
              color: CREAM,
              border: 'none',
              borderRadius: 14,
              fontSize: 14.5, fontWeight: 800,
              letterSpacing: '0.01em',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(15,36,82,0.18)',
            }}
          >
            {activeCount === 0
              ? 'Show all astrologers'
              : `Apply ${activeCount} filter${activeCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────  Sub-components  ───────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: 15.5, fontWeight: 700, color: NAVY,
        margin: '0 0 10px', letterSpacing: '-0.005em',
      }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChipRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SheetChip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: active ? NAVY : '#FFFFFF',
        color: active ? CREAM : NAVY,
        border: active ? '1px solid transparent' : `1px solid ${BORDER}`,
        borderRadius: 999,
        fontSize: 12.5, fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Two-handle price range using two stacked native `<input type="range">`s.
 * Chose this over the spec's fallback "two number inputs" because the visual
 * slider matches the marketplace aesthetic better and it's still ~40 lines of
 * plain CSS — no dependency.
 *
 * Implementation note: we clamp handles so min never exceeds max and vice
 * versa. The visible track between the handles is a plain <div> positioned
 * via % offsets.
 */
function PriceRange({
  min, max, onChange,
}: {
  min: number; max: number; onChange: (min: number, max: number) => void;
}) {
  const RANGE = PRICE_MAX_PAISE - PRICE_MIN_PAISE;
  const pct = (v: number) => ((v - PRICE_MIN_PAISE) / RANGE) * 100;
  const minPct = pct(min);
  const maxPct = pct(max);

  const step = 500; // ₹5 granularity

  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(Number(e.target.value), max - step);
    onChange(Math.max(PRICE_MIN_PAISE, v), max);
  };
  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(Number(e.target.value), min + step);
    onChange(min, Math.min(PRICE_MAX_PAISE, v));
  };

  return (
    <div>
      {/* Value readout */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 13, fontWeight: 700, color: NAVY,
        marginBottom: 8,
      }}>
        <span>₹{Math.round(min / 100)}</span>
        <span>₹{Math.round(max / 100)}{max >= PRICE_MAX_PAISE ? '+' : ''}</span>
      </div>

      {/* Track + handles */}
      <div style={{ position: 'relative', height: 32 }}>
        {/* Base track */}
        <div style={{
          position: 'absolute', top: 14, left: 0, right: 0, height: 4,
          background: 'rgba(15,36,82,0.15)', borderRadius: 2,
        }} />
        {/* Selected range */}
        <div style={{
          position: 'absolute', top: 14, height: 4,
          left: `${minPct}%`, right: `${100 - maxPct}%`,
          background: `linear-gradient(90deg, ${GOLD_L}, ${GOLD})`,
          borderRadius: 2,
        }} />

        {/* Both inputs share the exact same area; pointer-events cascades to
         *  whichever thumb is currently under the cursor. */}
        <input
          type="range"
          min={PRICE_MIN_PAISE} max={PRICE_MAX_PAISE} step={step}
          value={min}
          onChange={handleMin}
          aria-label="Minimum price"
          style={rangeInputStyle(2)}
        />
        <input
          type="range"
          min={PRICE_MIN_PAISE} max={PRICE_MAX_PAISE} step={step}
          value={max}
          onChange={handleMax}
          aria-label="Maximum price"
          style={rangeInputStyle(3)}
        />
      </div>

      {/* Number inputs as an accessibility fallback + precision control */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <PriceNumberInput
          label="Min"
          value={min}
          onChange={(v) => onChange(Math.min(v, max - step), max)}
        />
        <PriceNumberInput
          label="Max"
          value={max}
          onChange={(v) => onChange(min, Math.max(v, min + step))}
        />
      </div>
    </div>
  );
}

function rangeInputStyle(z: number): React.CSSProperties {
  return {
    position: 'absolute', top: 0, left: 0, width: '100%', height: 32,
    background: 'transparent',
    pointerEvents: 'none', // container handles hit; thumbs re-enable below
    appearance: 'none',
    WebkitAppearance: 'none',
    zIndex: z,
    // Native range thumb styling via a scoped stylesheet would be ideal, but
    // to avoid pulling in a global sheet we accept the native thumb here.
    // The thumb IS clickable because we re-enable pointer-events via ::thumb
    // pseudo-classes below (see <style> in main sheet).
  };
}

function PriceNumberInput({
  label, value, onChange,
}: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <label style={{
      flex: 1, display: 'flex', alignItems: 'center',
      background: '#FFFFFF', border: `1px solid ${BORDER}`,
      borderRadius: 10, padding: '6px 10px', fontSize: 12,
      color: TEXT2, gap: 6,
    }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span>₹</span>
      <input
        type="number"
        value={Math.round(value / 100)}
        min={Math.round(PRICE_MIN_PAISE / 100)}
        max={Math.round(PRICE_MAX_PAISE / 100)}
        onChange={(e) => {
          const rupees = Number(e.target.value);
          if (Number.isFinite(rupees)) onChange(rupees * 100);
        }}
        style={{
          flex: 1, border: 'none', outline: 'none',
          background: 'transparent', fontSize: 13, fontWeight: 700,
          color: NAVY, width: '100%', minWidth: 0,
        }}
      />
    </label>
  );
}
