/**
 * Launch-city registry — mirrors `src/common/config/cities.config.ts` on
 * the backend. Keep the two in sync whenever a city is added or moved.
 *
 * The frontend uses this list for:
 *   - the CitySelectorModal (shown on first dashboard load when GPS
 *     permission is denied / unavailable)
 *   - resolving a saved city back to civic-centre coords for optimistic
 *     map centering before the backend /nearby response arrives
 *   - rendering the city chips on the All-India tab
 */

export interface City {
  /** Stable slug sent to the API. Never change after launch. */
  slug: string;
  /** Display name for UI. */
  displayName: string;
  /** Civic-centre coords — kept identical to the backend mapping. */
  lat: number;
  lng: number;
}

export const CITIES: readonly City[] = [
  { slug: 'delhi',     displayName: 'Delhi',     lat: 28.6328, lng: 77.2197 },
  { slug: 'mumbai',    displayName: 'Mumbai',    lat: 18.9398, lng: 72.8355 },
  { slug: 'kolkata',   displayName: 'Kolkata',   lat: 22.5726, lng: 88.3639 },
  { slug: 'lucknow',   displayName: 'Lucknow',   lat: 26.8467, lng: 80.9462 },
  { slug: 'ahmedabad', displayName: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { slug: 'varanasi',  displayName: 'Varanasi',  lat: 25.3176, lng: 82.9739 },
] as const;

const CITY_INDEX: Record<string, City> = Object.freeze(
  CITIES.reduce<Record<string, City>>((acc, c) => {
    acc[c.slug] = c;
    return acc;
  }, {}),
);

export function resolveCity(slug: string | null | undefined): City | null {
  if (!slug) return null;
  return CITY_INDEX[slug.toLowerCase()] ?? null;
}
