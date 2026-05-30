/**
 * Format paise (integer) to INR display string.
 * Examples: 5000 → "₹50", 150000 → "₹1,500", 50 → "₹0.50"
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rupees);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Format rupees (decimal) to INR display string.
 */
export function formatRupees(rupees: number): string {
  return formatINR(Math.round(rupees * 100));
}

/**
 * Format per-minute rate.
 */
export function formatPerMinute(paisePerMin: number): string {
  return `${formatINR(paisePerMin)}/min`;
}
