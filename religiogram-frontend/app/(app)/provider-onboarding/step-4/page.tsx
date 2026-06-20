'use client';

/**
 * Step 4 — Services selection.
 *
 * Loads the religion-scoped catalogue and renders it as collapsible
 * categories with multi-select checkboxes. The "Other service" input at the
 * bottom lets providers add up to 10 custom services that aren't in the
 * master list — they flow through provider_services.custom_name server-side.
 *
 * If the user lands on this screen with no religion set (e.g. deep-link or
 * stale tab), we redirect back to Step 3 — it's the same server-side gate
 * expressed in the UI.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardShell from '@/components/provider-onboarding/WizardShell';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import {
  providerOnboardingApi,
  servicesCatalogueApi,
  type ServicesCatalogue,
} from '@/lib/provider-onboarding-api';

export default function Step4Page() {
  const router = useRouter();
  const { data, update, flush, advance } = useProviderOnboarding();

  const [catalogue, setCatalogue] = useState<ServicesCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(
    new Set(data.selectedServiceIds ?? []),
  );
  const [customs, setCustoms] = useState<string[]>(data.customServiceNames ?? []);
  const [customDraft, setCustomDraft] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  /* Gate: if no religion, bounce to Step 3. */
  useEffect(() => {
    if (!data.religion) {
      router.replace('/provider-onboarding/step-3');
    }
  }, [data.religion, router]);

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

  /* Fetch catalogue once religion is known. */
  useEffect(() => {
    if (!data.religion) return;
    let ignore = false;
    setLoading(true);
    servicesCatalogueApi
      .byReligion(data.religion)
      .then((c) => {
        if (ignore) return;
        setCatalogue(c);
        // Open all categories by default — for most religions there are ~3-5.
        setOpenCats(new Set(c.categories.map((x) => x.name)));
      })
      .catch((e) => setErr(e?.message ?? 'Could not load services.'))
      .finally(() => setLoading(false));
    return () => {
      ignore = true;
    };
  }, [data.religion]);

  /* Sync store on change. */
  useEffect(() => {
    update({
      selectedServiceIds: Array.from(selected),
      customServiceNames: customs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, customs]);

  const toggle = (id: number) =>
    setSelected((cur) => {
      const next = new Set<number>(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleCategory = (name: string) =>
    setOpenCats((cur) => {
      const next = new Set<string>(cur);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const addCustom = () => {
    const v = customDraft.trim();
    if (!v) return;
    if (customs.length >= 10) {
      setErr('You can add up to 10 custom services.');
      return;
    }
    if (customs.includes(v)) {
      setErr('You already added that one.');
      return;
    }
    setCustoms((c: any) => [...c, v]);
    setCustomDraft('');
    setErr(null);
  };

  const removeCustom = (v: string) =>
    setCustoms((c: any) => c.filter((x: any) => x !== v));

  const total = selected.size + customs.length;
  const canContinue = total > 0;

  const onContinue = async () => {
    setErr(null);
    try {
      await flush();
      // Step 4 records the selection locally; pricing comes in step 5 and
      // the consolidated POST /:id/services fires there.
      await providerOnboardingApi.step4({
        services: Array.from(selected).map((sid) => ({
          catalogServiceId: Number(sid),
          pricePaise: 0, // placeholder — real value set in step 5
        })),
      });
      advance(5);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save.');
      throw e;
    }
  };

  return (
    <WizardShell
      currentStep={4}
      canContinue={canContinue}
      onContinue={onContinue}
      nextLabel={total ? `Save & Continue (${total})` : 'Pick at least one'}
    >
      {loading && (
        <div className="flex justify-center py-10">
          <span className="w-7 h-7 border-2 border-[#0F2452]/20 border-t-amber-700 rounded-full animate-spin" />
        </div>
      )}

      {!loading && catalogue && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700/80">
            Tap every service you can offer. You can change prices and details
            in the next step.
          </p>

          {catalogue.categories.map((cat: any) => {
            const open = openCats.has(cat.name);
            const selectedInCat = cat.services.filter((s: any) =>
              selected.has(Number(s.id)),
            ).length;
            return (
              <section
                key={cat.name}
                className="rounded-2xl border border-[#0F2452]/15 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.name)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left
                             hover:bg-[#0F2452]/5"
                  aria-expanded={open}
                >
                  <span className="font-semibold text-gray-700">
                    {cat.name}
                    {selectedInCat > 0 && (
                      <span className="ml-2 text-xs text-[#0F2452]">
                        ({selectedInCat} selected)
                      </span>
                    )}
                  </span>
                  <span
                    className="text-gray-700/60 transition-transform duration-200"
                    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>
                {open && (
                  <ul className="border-t border-[#0F2452]/10 divide-y divide-gray-900/10">
                    {cat.services.map((s: any) => {
                      const id = Number(s.id);
                      const on = selected.has(id);
                      return (
                        <li key={s.id}>
                          <label
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#0F2452]/5"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(id)}
                              className="mt-1 h-5 w-5 accent-[#0F2452]"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-gray-700">{s.name}</p>
                              {s.description && (
                                <p className="text-xs text-gray-700/70 mt-0.5">
                                  {s.description}
                                </p>
                              )}
                              {(s.suggestedMinPrice != null ||
                                s.suggestedDurationMinutes != null) && (
                                <p className="text-xs text-gray-700/50 mt-1">
                                  {s.suggestedDurationMinutes != null &&
                                    `~${s.suggestedDurationMinutes} min`}
                                  {s.suggestedMinPrice != null &&
                                    s.suggestedMaxPrice != null &&
                                    ` · typical ₹${Math.round(
                                      s.suggestedMinPrice / 100,
                                    )} – ₹${Math.round(s.suggestedMaxPrice / 100)}`}
                                </p>
                              )}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}

          {/* Other service */}
          <section className="rounded-2xl border border-dashed border-[#0F2452]/30 bg-white p-4">
            <p className="font-semibold text-gray-700 mb-2">
              Other service <span className="text-xs text-gray-700/50 font-normal">(optional)</span>
            </p>
            <p className="text-xs text-gray-700/70 mb-3">
              Offer something not in the list? Add it here — up to 10 custom services.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-3 rounded-xl border border-[#0F2452]/20 bg-white text-base
                           focus:outline-none focus:ring-2 focus:ring-[#0F2452]/40"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="e.g. Rudraksha consultation"
                maxLength={160}
              />
              <button
                type="button"
                onClick={addCustom}
                className="px-4 py-3 rounded-xl bg-[#0F2452]/10 text-gray-700 font-medium
                           hover:bg-[#0F2452]/15"
              >
                Add
              </button>
            </div>
            {customs.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {customs.map((c: any) => (
                  <li
                    key={c}
                    className="inline-flex items-center gap-2 bg-[#0F2452]/5
                               px-3 py-1.5 rounded-full text-sm text-gray-700"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCustom(c)}
                      aria-label={`Remove ${c}`}
                      className="text-gray-700/60 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {err && <p className="text-sm text-red-700">{err}</p>}
        </div>
      )}
    </WizardShell>
  );
}
