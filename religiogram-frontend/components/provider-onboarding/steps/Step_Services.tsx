'use client';

/**
 * Step_Services — multi-select service picker with editable price overrides.
 *
 * Renders catalogue grouped by category, collapsible sections, gold checkboxes.
 * Requires ≥1 service selected. Editable price override within market range.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProviderOnboarding } from '@/lib/provider-onboarding-store';
import { formatRupees } from '@/lib/format-currency';
import {
  servicesCatalogueApi,
  type ServiceMasterRow,
  type ServicesCatalogue,
} from '@/lib/provider-onboarding-api';

const GOLD = '#C8932A';
const NAVY = '#0F2452';

interface PriceOverride { [serviceId: string]: number; }

interface Props {
  onCanContinueChange?: (v: boolean) => void;
}

function rupees2paise(r: string): number {
  const n = parseFloat(r.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function Step_Services({ onCanContinueChange }: Props) {
  const router = useRouter();
  const { data, update } = useProviderOnboarding();

  const [catalogue, setCatalogue] = useState<ServicesCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set((data.selectedServiceIds ?? []).map(String)),
  );
  const [prices, setPrices] = useState<PriceOverride>({});
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data.religion) router.replace('/provider-onboarding/step-3');
  }, [data.religion, router]);

  useEffect(() => {
    if (!data.religion) return;
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    servicesCatalogueApi
      .byReligion(data.religion)
      .then((c) => {
        if (cancelled) return;
        setCatalogue(c);
        setOpenCats(new Set(c.categories.map((cat) => cat.name)));
      })
      .catch((e) => {
        if (!cancelled) setFetchErr(e?.message ?? 'Failed to load services. Please retry.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [data.religion]);

  const canContinue = selected.size > 0;

  useEffect(() => { onCanContinueChange?.(canContinue); }, [canContinue, onCanContinueChange]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { update({ selectedServiceIds: Array.from(selected).map(Number) }); }, [selected]);

  const toggleService = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleCat = (name: string) => {
    setOpenCats((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };
  const setPrice = (id: string, raw: string, row: ServiceMasterRow) => {
    const paise = rupees2paise(raw);
    const minP = row.suggestedMinPrice ?? 0;
    const maxP = row.suggestedMaxPrice ?? Infinity;
    setPrices((p) => ({ ...p, [id]: Math.max(minP, Math.min(maxP, paise)) }));
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
        <p style={{ fontSize: 15 }}>Loading services for your faith…</p>
      </div>
    );
  }
  if (fetchErr) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: '#EF4444', marginBottom: 20 }}>{fetchErr}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{
        fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6,
        fontFamily: "'Playfair Display',Georgia,serif",
      }}>
        Which services do you offer?
      </h2>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 6, lineHeight: 1.6 }}>
        Select at least one. Set your own price within the suggested range.
      </p>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: selected.size > 0 ? `${GOLD}18` : '#F3F4F6',
        color: selected.size > 0 ? '#92680A' : '#9CA3AF',
        borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, marginBottom: 22,
      }}>
        {selected.size > 0 ? `✓ ${selected.size} selected` : 'Select at least 1 service'}
      </div>

      {catalogue?.categories.map((cat) => (
        <div key={cat.name} style={{
          background: '#fff', borderRadius: 16, marginBottom: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <button
            onClick={() => toggleCat(cat.name)}
            style={{
              width: '100%', padding: '14px 18px', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: openCats.has(cat.name) ? '1px solid #F3F4F6' : 'none',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
              {cat.name}
              <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 6, fontSize: 12 }}>
                ({cat.services.length})
              </span>
            </span>
            <span style={{ color: '#9CA3AF' }}>
              <ChevronIcon open={openCats.has(cat.name)} />
            </span>
          </button>

          {openCats.has(cat.name) && cat.services.map((svc, idx) => {
            const id = String(svc.id);
            const isChecked = selected.has(id);
            const minR = svc.suggestedMinPrice ? Math.round(svc.suggestedMinPrice / 100) : null;
            const maxR = svc.suggestedMaxPrice ? Math.round(svc.suggestedMaxPrice / 100) : null;
            const overrideR = prices[id] != null
              ? Math.round(prices[id] / 100)
              : (svc.suggestedMinPrice != null ? Math.round(svc.suggestedMinPrice / 100) : '');

            return (
              <div key={svc.id} style={{
                borderBottom: idx < cat.services.length - 1 ? '1px solid #F9FAFB' : 'none',
                background: isChecked ? `${GOLD}08` : 'transparent',
              }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <button
                    onClick={() => toggleService(id)}
                    role="checkbox"
                    aria-checked={isChecked}
                    style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: isChecked ? GOLD : 'transparent',
                      border: `2px solid ${isChecked ? GOLD : '#D1D5DB'}`,
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', marginTop: 2, outline: 'none',
                    }}
                  >
                    {isChecked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', marginBottom: 3 }}>
                      {svc.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {svc.suggestedDurationMinutes && (
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          ⏱ {svc.suggestedDurationMinutes} min
                        </span>
                      )}
                      {(minR != null || maxR != null) && (
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          RG suggested: {minR != null ? formatRupees(minR) : ''}
                          {minR != null && maxR != null ? ' – ' : ''}
                          {maxR != null ? formatRupees(maxR) : ''}
                        </span>
                      )}
                    </div>

                    {isChecked && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Your price:</span>
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          border: `1.5px solid ${GOLD}`, borderRadius: 8, background: '#FFFBEF',
                        }}>
                          <span style={{ padding: '5px 8px', fontSize: 13, color: '#92680A', fontWeight: 700 }}>₹</span>
                          <input
                            type="number"
                            min={minR ?? 0}
                            max={maxR ?? undefined}
                            value={overrideR}
                            onChange={(e) => setPrice(id, e.target.value, svc)}
                            style={{
                              border: 'none', outline: 'none', background: 'transparent',
                              fontSize: 13, width: 70, padding: '5px 6px', color: '#1F2937',
                            }}
                          />
                        </div>
                        {(minR != null || maxR != null) && (
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                            ({minR != null ? `min ${formatRupees(minR)}` : ''}
                            {minR != null && maxR != null ? ', ' : ''}
                            {maxR != null ? `max ${formatRupees(maxR)}` : ''})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {!canContinue && (
        <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>
          Select at least one service to continue.
        </p>
      )}
    </div>
  );
}

/** Build POST body for /provider/services. Call from the page's onContinue. */
export function buildServicesPayload(
  selectedIds: string[],
  prices: PriceOverride,
  catalogue: ServicesCatalogue | null,
) {
  const allSvcs = catalogue?.categories.flatMap((c) => c.services) ?? [];
  return {
    serviceIds: selectedIds.map(Number),
    customServiceNames: [] as string[],
    items: selectedIds.map((id) => {
      const svc = allSvcs.find((s) => String(s.id) === id);
      return {
        serviceId: Number(id),
        basePricePaise: prices[id] ?? svc?.suggestedMinPrice ?? 0,
        durationMinutes: svc?.suggestedDurationMinutes ?? 60,
        mode: 'offline' as const,
      };
    }),
  };
}
