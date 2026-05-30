'use client';

/**
 * Step 5 — Pricing setup.
 *
 * For every service the provider selected in Step 4, they set:
 *   · Base price (rupees)       → stored as integer paise
 *   · Add-on fee (optional)     → things like kit / prasad / extras
 *   · Travel fee (optional)     → in-person visits only
 *   · Duration in minutes
 *   · Mode: online / offline / both
 *
 * The final price shown to devotees is:
 *
 *     Final = Base + Add-ons + Travel + PlatformFee(subtotal)
 *
 * where PlatformFee is tiered (10% / 8% / 6%). This mirror lives in
 * `computeFinalPricePaise` below so the user sees the same number the
 * backend will eventually compute — no nasty surprises on the booking
 * screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import {
  SERVICE_MODES,
  paiseToRupees,
  rupeesToPaise,
  useProviderOnboarding,
} from '@/lib/provider-onboarding-store';
import {
  providerOnboardingApi,
  servicesCatalogueApi,
  type PricingItem,
  type ServiceMasterRow,
  type ServiceMode,
  type ServicesCatalogue,
} from '@/lib/provider-onboarding-api';

/* ──────────────────── Pricing mirror (keep in sync with backend) ──────────────────── */

function computePlatformFeePaise(subtotalPaise: number): number {
  // Tiered: 10% ≤ ₹5,000; 8% ≤ ₹20,000; 6% above.
  if (subtotalPaise <= 500_000) return Math.round(subtotalPaise * 0.1);
  if (subtotalPaise <= 2_000_000) return Math.round(subtotalPaise * 0.08);
  return Math.round(subtotalPaise * 0.06);
}

function computeFinalPricePaise(
  basePaise: number,
  addonPaise: number,
  travelPaise: number,
): { subtotal: number; platformFee: number; final: number } {
  const subtotal = Math.max(0, basePaise) + Math.max(0, addonPaise) + Math.max(0, travelPaise);
  const platformFee = computePlatformFeePaise(subtotal);
  return { subtotal, platformFee, final: subtotal + platformFee };
}

/* ──────────────────── Row model ──────────────────── */

type RowKey = string; // `svc:${id}` or `custom:${name}`

interface PricingRow {
  key: RowKey;
  title: string;
  subtitle?: string | null;
  serviceId?: number;
  customName?: string;
  basePriceRupees: string;
  addonFeeRupees: string;
  travelFeeRupees: string;
  durationMinutes: string;
  mode: ServiceMode;
  /** Server-suggested band, used as ghost placeholder. */
  suggestedMinRupees?: number | null;
  suggestedMaxRupees?: number | null;
  suggestedDuration?: number | null;
}

function emptyRow(
  key: RowKey,
  title: string,
  subtitle: string | null | undefined,
  opts: {
    serviceId?: number;
    customName?: string;
    suggestedMinPaise?: number | null;
    suggestedMaxPaise?: number | null;
    suggestedDuration?: number | null;
  },
): PricingRow {
  return {
    key,
    title,
    subtitle: subtitle ?? undefined,
    serviceId: opts.serviceId,
    customName: opts.customName,
    basePriceRupees: '',
    addonFeeRupees: '',
    travelFeeRupees: '',
    durationMinutes: opts.suggestedDuration != null ? String(opts.suggestedDuration) : '',
    mode: 'both',
    suggestedMinRupees:
      opts.suggestedMinPaise != null ? Math.round(opts.suggestedMinPaise / 100) : null,
    suggestedMaxRupees:
      opts.suggestedMaxPaise != null ? Math.round(opts.suggestedMaxPaise / 100) : null,
    suggestedDuration: opts.suggestedDuration ?? null,
  };
}

export default function Step5Page() {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const [catalogue, setCatalogue] = useState<ServicesCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  /* Gate: if no religion or no services, bounce back. */
  useEffect(() => {
    if (!data.religion) {
      router.replace('/provider-onboarding/step-3');
      return;
    }
    const picked = (data.selectedServiceIds?.length ?? 0) + (data.customServiceNames?.length ?? 0);
    if (picked === 0) {
      router.replace('/provider-onboarding/step-4');
    }
  }, [data.religion, data.selectedServiceIds, data.customServiceNames, router]);

  /* Load catalogue (to resolve service names) */
  useEffect(() => {
    if (!data.religion) return;
    let ignore = false;
    setLoading(true);
    servicesCatalogueApi
      .byReligion(data.religion)
      .then((c) => {
        if (!ignore) setCatalogue(c);
      })
      .catch((e) => setErr(e?.message ?? 'Could not load services.'))
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [data.religion]);

  /* Build the row list once the catalogue arrives. Preserve any existing values
   * from the store so revisiting the step doesn't nuke the provider's work. */
  useEffect(() => {
    if (!catalogue) return;

    const byId = new Map<number, ServiceMasterRow>();
    for (const cat of catalogue.categories) {
      for (const s of cat.services) byId.set(Number(s.id), s);
    }

    const previous = new Map<RowKey, PricingItem>(
      (data.pricing ?? []).map((p) => [
        p.serviceId != null ? `svc:${p.serviceId}` : `custom:${p.customName}`,
        p,
      ]),
    );

    const svcRows: PricingRow[] = (data.selectedServiceIds ?? []).map((id) => {
      const s = byId.get(id);
      const key: RowKey = `svc:${id}`;
      const row = emptyRow(key, s?.name ?? `Service #${id}`, s?.description, {
        serviceId: id,
        suggestedMinPaise: s?.suggestedMinPrice ?? null,
        suggestedMaxPaise: s?.suggestedMaxPrice ?? null,
        suggestedDuration: s?.suggestedDurationMinutes ?? null,
      });
      const prev = previous.get(key);
      if (prev) {
        row.basePriceRupees = String(paiseToRupees(prev.basePricePaise));
        row.addonFeeRupees = prev.addonFeePaise
          ? String(paiseToRupees(prev.addonFeePaise))
          : '';
        row.travelFeeRupees = prev.travelFeePaise
          ? String(paiseToRupees(prev.travelFeePaise))
          : '';
        row.durationMinutes = String(prev.durationMinutes);
        row.mode = prev.mode;
      }
      return row;
    });

    const customRows: PricingRow[] = (data.customServiceNames ?? []).map((name) => {
      const key: RowKey = `custom:${name}`;
      const row = emptyRow(key, name, 'Custom service', { customName: name });
      const prev = previous.get(key);
      if (prev) {
        row.basePriceRupees = String(paiseToRupees(prev.basePricePaise));
        row.addonFeeRupees = prev.addonFeePaise
          ? String(paiseToRupees(prev.addonFeePaise))
          : '';
        row.travelFeeRupees = prev.travelFeePaise
          ? String(paiseToRupees(prev.travelFeePaise))
          : '';
        row.durationMinutes = String(prev.durationMinutes);
        row.mode = prev.mode;
      }
      return row;
    });

    setRows([...svcRows, ...customRows]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue]);

  /* Sync rows → store on change. Converts rupees → paise for the wire. */
  useEffect(() => {
    if (!rows.length) return;
    const pricing: PricingItem[] = rows.map((r: any) => ({
      serviceId: r.serviceId,
      customName: r.customName,
      basePricePaise: rupeesToPaise(r.basePriceRupees || 0),
      addonFeePaise: r.addonFeeRupees ? rupeesToPaise(r.addonFeeRupees) : 0,
      travelFeePaise: r.travelFeeRupees ? rupeesToPaise(r.travelFeeRupees) : 0,
      durationMinutes: Number(r.durationMinutes || 0),
      mode: r.mode,
    }));
    update({ pricing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const setRow = (key: RowKey, patch: Partial<PricingRow>) =>
    setRows((cur: any) => cur.map((r: any) => (r.key === key ? { ...r, ...patch } : r)));

  /* Validation: every row must have base > 0 and duration ≥ 5. */
  const validation = useMemo(() => {
    const invalid: string[] = [];
    for (const r of rows) {
      const base = Number(r.basePriceRupees);
      const dur = Number(r.durationMinutes);
      if (!base || base < 1) invalid.push(`${r.title}: base price missing`);
      else if (base > 500_000) invalid.push(`${r.title}: base price looks too high`);
      if (!dur || dur < 5) invalid.push(`${r.title}: duration must be ≥ 5 min`);
      else if (dur > 720) invalid.push(`${r.title}: duration must be ≤ 12 h`);
    }
    return invalid;
  }, [rows]);

  const canContinue = rows.length > 0 && validation.length === 0;

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
      const items: PricingItem[] = rows.map((r: any) => ({
        serviceId: r.serviceId,
        customName: r.customName,
        basePricePaise: rupeesToPaise(r.basePriceRupees),
        addonFeePaise: r.addonFeeRupees ? rupeesToPaise(r.addonFeeRupees) : undefined,
        travelFeePaise: r.travelFeeRupees ? rupeesToPaise(r.travelFeeRupees) : undefined,
        durationMinutes: Number(r.durationMinutes),
        mode: r.mode,
      }));
      await providerOnboardingApi.step5({ items });
      advance(6);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save pricing.');
      throw e;
    }
  };

  return (
    <WizardShell
      currentStep={5}
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel={canContinue ? 'Save & Continue' : 'Fill pricing first'}
    >
      {loading && (
        <div className="flex justify-center py-10">
          <span className="w-7 h-7 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700/80">
            Set a fair price for each service. We show devotees the{' '}
            <b>final amount</b> — including our small platform fee — so they
            know exactly what they'll pay.
          </p>

          {rows.map((r: any) => {
            const basePaise = rupeesToPaise(r.basePriceRupees || 0);
            const addonPaise = r.addonFeeRupees ? rupeesToPaise(r.addonFeeRupees) : 0;
            const travelPaise = r.travelFeeRupees ? rupeesToPaise(r.travelFeeRupees) : 0;
            const { subtotal, platformFee, final } = computeFinalPricePaise(
              basePaise,
              addonPaise,
              travelPaise,
            );
            const hasBase = basePaise > 0;

            return (
              <section
                key={r.key}
                className="rounded-2xl border border-[#0F2452]/15 bg-white p-4 space-y-4"
              >
                <div>
                  <p className="font-semibold text-gray-700">{r.title}</p>
                  {r.subtitle && (
                    <p className="text-xs text-gray-700/60 mt-0.5">{r.subtitle}</p>
                  )}
                </div>

                {/* Price row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MoneyField
                    label="Base price"
                    required
                    value={r.basePriceRupees}
                    onChange={(v) => setRow(r.key, { basePriceRupees: v })}
                    placeholder={
                      r.suggestedMinRupees && r.suggestedMaxRupees
                        ? `${r.suggestedMinRupees} – ${r.suggestedMaxRupees}`
                        : '0'
                    }
                    hint={
                      r.suggestedMinRupees && r.suggestedMaxRupees
                        ? `Typical: ₹${r.suggestedMinRupees} – ₹${r.suggestedMaxRupees}`
                        : undefined
                    }
                  />
                  <MoneyField
                    label="Add-ons"
                    optional
                    value={r.addonFeeRupees}
                    onChange={(v) => setRow(r.key, { addonFeeRupees: v })}
                    placeholder="0"
                    hint="Kit / prasad / extras"
                  />
                  <MoneyField
                    label="Travel fee"
                    optional
                    value={r.travelFeeRupees}
                    onChange={(v) => setRow(r.key, { travelFeeRupees: v })}
                    placeholder="0"
                    hint="In-person visits only"
                    disabled={r.mode === 'online'}
                  />
                </div>

                {/* Duration + mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
                      Duration (minutes)
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={720}
                      step={5}
                      value={r.durationMinutes}
                      onChange={(e) =>
                        setRow(r.key, { durationMinutes: e.target.value.replace(/\D/g, '') })
                      }
                      placeholder={
                        r.suggestedDuration ? String(r.suggestedDuration) : '60'
                      }
                      className="w-full px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base
                                 focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40"
                    />
                  </label>

                  <div>
                    <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
                      How can devotees attend?
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_MODES.map((m) => {
                        const on = r.mode === m.value;
                        return (
                          <button
                            type="button"
                            key={m.value}
                            onClick={() =>
                              setRow(r.key, {
                                mode: m.value,
                                // Zero out travel fee if going online-only
                                ...(m.value === 'online' ? { travelFeeRupees: '' } : {}),
                              })
                            }
                            className={`px-3 py-2 rounded-full text-sm border transition
                              ${
                                on
                                  ? 'bg-[#0F2452] text-[#F7EFE1] border-[#0F2452]'
                                  : 'bg-white text-gray-700 border-[#0F2452]/20 hover:bg-[#0F2452]/5'
                              }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Live breakdown */}
                {hasBase && (
                  <div className="rounded-xl bg-[#0F2452]/5 px-4 py-3 text-sm text-gray-700/90 space-y-1">
                    <Line label="Base" paise={basePaise} />
                    {addonPaise > 0 && <Line label="Add-ons" paise={addonPaise} />}
                    {travelPaise > 0 && <Line label="Travel" paise={travelPaise} />}
                    <Line label="Platform fee" paise={platformFee} muted />
                    <div className="pt-2 mt-1 border-t border-[#0F2452]/15 flex justify-between">
                      <span className="font-semibold">Devotee pays</span>
                      <span className="font-semibold">₹{formatRupees(final)}</span>
                    </div>
                    <p className="text-[11px] text-gray-700/50 pt-0.5">
                      You receive ₹{formatRupees(subtotal)} · platform fee covers
                      booking, payment, and support.
                    </p>
                  </div>
                )}
              </section>
            );
          })}

          {validation.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold mb-1">Please fix:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {validation.slice(0, 6).map((v: any) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
      )}
    </WizardShell>
  );
}

/* ──────────────────── Small helpers ──────────────────── */

function formatRupees(paise: number): string {
  const n = (paise | 0) / 100;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function Line({
  label,
  paise,
  muted,
}: {
  label: string;
  paise: number;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${muted ? 'text-gray-700/60' : ''}`}>
      <span>{label}</span>
      <span>₹{formatRupees(paise)}</span>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  optional,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700/90 block mb-1.5">
        {label}
        {required && <span className="text-red-600"> *</span>}
        {optional && <span className="text-gray-700/50 font-normal"> (optional)</span>}
      </span>
      <div
        className={`flex items-stretch rounded-xl border overflow-hidden
          ${disabled ? 'border-[#0F2452]/10 bg-[#0F2452]/[0.03]' : 'border-[#0F2452]/20 bg-white'}
          focus-within:ring-2 focus-within:ring-[#0F2452]/40`}
      >
        <span
          className={`px-3 flex items-center text-base ${
            disabled ? 'text-gray-700/40' : 'text-gray-700/70'
          }`}
        >
          ₹
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            // Allow digits + one decimal point, 0-2 decimal places
            const cleaned = e.target.value
              .replace(/[^\d.]/g, '')
              .replace(/(\..*)\./g, '$1')
              .replace(/(\.\d{2})\d+$/, '$1');
            onChange(cleaned);
          }}
          placeholder={placeholder}
          className="flex-1 px-2 py-3 bg-transparent text-base focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {hint && <p className="text-[11px] text-gray-700/55 mt-1">{hint}</p>}
    </label>
  );
}
