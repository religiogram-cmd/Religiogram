/**
 * Pricing module — single source of truth for the "final price" formula.
 *
 * Formula:
 *   final = base + addon + travel + platform_fee
 *
 * `platform_fee` is computed at display/booking time, NOT frozen into
 * provider_services, so that fee-schedule changes propagate cleanly.
 *
 * Tiered platform fee: 10% up to ₹5000, 8% up to ₹20000, 6% above
 * (keeps small rituals affordable, scales down for premium ceremonies).
 *
 * All values in paise (integer). Never use floats here — line totals
 * cascade into payments, and floating-point drift shows up as ₹0.01
 * discrepancies in the ledger.
 */

export interface PriceInputs {
  basePricePaise: number;
  travelFeePaise?: number;
  addonFeePaise?: number;
}

export interface PriceBreakdown {
  basePaise: number;
  travelPaise: number;
  addonPaise: number;
  platformFeePaise: number;
  /** base + travel + addon + platform_fee */
  totalPaise: number;
  /** For display */
  totalRupees: number;
}

export function computePlatformFeePaise(subtotalPaise: number): number {
  if (subtotalPaise <= 0) return 0;
  // Tier boundaries in paise
  if (subtotalPaise <= 5_00_000) return Math.round(subtotalPaise * 0.10);
  if (subtotalPaise <= 20_00_000) return Math.round(subtotalPaise * 0.08);
  return Math.round(subtotalPaise * 0.06);
}

export function computeFinalPrice(inputs: PriceInputs): PriceBreakdown {
  const base = Math.max(0, inputs.basePricePaise | 0);
  const travel = Math.max(0, (inputs.travelFeePaise ?? 0) | 0);
  const addon = Math.max(0, (inputs.addonFeePaise ?? 0) | 0);
  const subtotal = base + travel + addon;
  const platformFee = computePlatformFeePaise(subtotal);
  const total = subtotal + platformFee;

  return {
    basePaise: base,
    travelPaise: travel,
    addonPaise: addon,
    platformFeePaise: platformFee,
    totalPaise: total,
    totalRupees: total / 100,
  };
}
