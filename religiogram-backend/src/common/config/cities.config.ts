/**
 * Launch-city registry — the single source of truth shared by the
 * temple discovery endpoints when the caller can't (or doesn't want to)
 * provide GPS coordinates.
 *
 * Each city resolves to its civic-centre coords. These are deliberately
 * picked at landmarks with good dwell-time (e.g. Connaught Place for
 * Delhi, CST for Mumbai) so the fallback radius query feels like "near
 * you in this city" rather than a suburban edge.
 *
 * Why a static config?
 *   - The list ships with the app; no DB round-trip, no migration needed
 *     to add/remove a city.
 *   - We need these coords on both the cache-key path and the geo path;
 *     a shared constant keeps them aligned with the frontend config.
 *   - Adding a 7th city later is a one-line change + a seed top-up.
 *
 * Slug discipline:
 *   - Keys are lowercase ASCII slugs, with no punctuation. Frontend
 *     normalises the user's selection the same way before sending.
 *   - The display name is what shows up in UI (if the backend ever needs
 *     to render it, e.g. email confirmations).
 */

export interface CityEntry {
  /** Stable url-safe slug. Never change after launch. */
  slug: string;
  /** Display name for UI. */
  displayName: string;
  /** Civic centre coordinates — used as fallback center for geo queries. */
  lat: number;
  lng: number;
  /** Default search radius for city-scoped /nearby fallbacks (km). */
  defaultRadiusKm: number;
}

/**
 * Ordered list mirrors the frontend's UI order. Keep them identical.
 */
export const LAUNCH_CITIES: readonly CityEntry[] = [
  { slug: 'delhi',     displayName: 'Delhi',     lat: 28.6328, lng: 77.2197, defaultRadiusKm: 20 },
  { slug: 'mumbai',    displayName: 'Mumbai',    lat: 18.9398, lng: 72.8355, defaultRadiusKm: 25 },
  { slug: 'kolkata',   displayName: 'Kolkata',   lat: 22.5726, lng: 88.3639, defaultRadiusKm: 20 },
  { slug: 'lucknow',   displayName: 'Lucknow',   lat: 26.8467, lng: 80.9462, defaultRadiusKm: 15 },
  { slug: 'ahmedabad', displayName: 'Ahmedabad', lat: 23.0225, lng: 72.5714, defaultRadiusKm: 20 },
  { slug: 'varanasi',  displayName: 'Varanasi',  lat: 25.3176, lng: 82.9739, defaultRadiusKm: 12 },
] as const;

/** O(1) lookup by slug, case-insensitive. */
const CITY_INDEX: Readonly<Record<string, CityEntry>> = Object.freeze(
  LAUNCH_CITIES.reduce<Record<string, CityEntry>>((acc, c) => {
    acc[c.slug] = c;
    return acc;
  }, {}),
);

/**
 * Normalise a user-supplied value to a slug.
 * Accepts "Delhi", "delhi", " DELHI ", "Delhi-NCR" (trims extra tokens)
 * — but only exact slug matches resolve; everything else returns null.
 */
export function resolveCity(raw: string | undefined | null): CityEntry | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  return CITY_INDEX[slug] ?? null;
}

/** Used by the frontend health/listing route if we ever expose it. */
export function listCities(): readonly CityEntry[] {
  return LAUNCH_CITIES;
}
