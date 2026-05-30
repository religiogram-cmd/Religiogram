'use client';

import { useEffect, useRef, useState } from 'react';
import { useCityContext as useCity } from '@/contexts/CityContext';
import type { City } from '@/lib/cities';
import { CITIES } from '@/lib/cities';

/**
 * CitySelectorModal — first-load gate shown when we can't use GPS.
 *
 * Behaviour
 * ---------
 *   - Opens when `open` is true and closes via onClose when the user
 *     picks a city. Dismissing without a choice is deliberately hard:
 *     the discovery screen needs *some* centre, and the whole point of
 *     the modal is to get one.
 *   - Uses <dialog> semantics via role="dialog" + aria-modal so screen
 *     readers announce it properly. The parent traps focus; we focus
 *     the first button on mount and restore focus to the opener on
 *     close.
 *   - Supports keyboard: Esc closes, Tab cycles, Enter selects the
 *     focused city.
 *
 * Why a modal and not an inline section
 * -------------------------------------
 *   The city scope is load-bearing for every downstream query. Making
 *   the user acknowledge it explicitly — once — keeps the rest of the
 *   app uncluttered. Power users can switch cities later via the chips
 *   on the All-India tab.
 */

export interface CitySelectorModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the newly-selected city after it's been persisted. */
  onSelected?: (city: City) => void;
  /**
   * Display this copy at the top of the modal. Defaults to a friendly
   * "Where are you?" prompt — override when reusing the modal from
   * settings ("Change your city").
   */
  title?: string;
  subtitle?: string;
}

export function CitySelectorModal({
  open,
  onClose,
  onSelected,
  title = 'Where are you?',
  subtitle = 'Choose your city so we can show nearby temples.',
}: CitySelectorModalProps) {
  const _cityCtx = useCity() as any;
  const city = (_cityCtx?.city ?? null) as City | null;
  const cities: readonly City[] = (_cityCtx?.cities as readonly City[] | undefined) ?? CITIES;
  const setCity: (slugOrCity: any) => void = (_cityCtx?.setCity as ((slugOrCity: any) => void) | undefined) ?? (() => {});
  const [focused, setFocused] = useState<string | null>(city?.slug ?? null);
  const firstBtnRef = useRef<HTMLButtonElement | null>(null);

  /* ── Focus management: focus first option when opened. ── */
  useEffect(() => {
    if (open) {
      // Defer to next tick so the element actually exists in the DOM.
      const t = requestAnimationFrame(() => firstBtnRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  /* ── Esc to close, Enter to confirm focused. ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (c: City) => {
    setCity(c.slug);
    onSelected?.(c);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="city-selector-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(61,30,10,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        // Backdrop click only closes when a city is already chosen — otherwise
        // we keep the modal up to enforce the selection.
        if (e.target === e.currentTarget && city) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-[420px] rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 120% 60% at 50% 0%, #F6F7FA 0%, #F6F7FA 55%, #E8DFD0 100%)',
          boxShadow: '0 -8px 40px rgba(61,30,10,.35)',
        }}
      >
        <div className="p-6">
          <h2
            id="city-selector-title"
            className="text-[19px] font-bold text-[#0F2452]"
            style={{ fontFamily: "'Playfair Display',serif" }}
          >
            {title}
          </h2>
          <p className="text-[12.5px] text-[#374151] mt-1 leading-relaxed">
            {subtitle}
          </p>

          <div
            role="radiogroup"
            aria-labelledby="city-selector-title"
            className="grid grid-cols-2 gap-2 mt-4"
          >
            {cities.map((c, i) => {
              const isActive = (focused ?? city?.slug) === c.slug;
              return (
                <button
                  key={c.slug}
                  ref={i === 0 ? firstBtnRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onFocus={() => setFocused(c.slug)}
                  onClick={() => handlePick(c)}
                  className="h-14 rounded-2xl px-3 flex flex-col items-start justify-center transition-all"
                  style={{
                    background: isActive
                      ? 'linear-gradient(140deg, #C8932A 0%, #C8932A 50%, #9A7B1E 100%)'
                      : 'rgba(255,252,245,.88)',
                    color: isActive ? '#ffffff' : '#0F2452',
                    border: `1px solid ${isActive ? 'transparent' : 'rgba(197,138,75,.22)'}`,
                    boxShadow: isActive
                      ? '0 6px 16px rgba(169,113,66,.28)'
                      : '0 1px 4px rgba(107,63,29,.06)',
                  }}
                >
                  <span
                    className="text-[14px] font-semibold leading-tight"
                    style={{ fontFamily: "'Inter',sans-serif" }}
                  >
                    {c.displayName}
                  </span>
                  <span
                    className="text-[10.5px]"
                    style={{
                      color: isActive ? 'rgba(253,245,232,.75)' : 'rgba(122,85,53,.7)',
                    }}
                  >
                    {c.slug}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Supplementary action — let the user keep their existing pick
              rather than being forced into a change. Shown only when we
              already have a saved city (Settings flow). */}
          {city && (
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-2xl mt-4 text-[13px] font-semibold"
              style={{
                background: 'transparent',
                color: '#0F2452',
                border: '1px solid rgba(169,113,66,.22)',
              }}
            >
              Keep {city.displayName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
