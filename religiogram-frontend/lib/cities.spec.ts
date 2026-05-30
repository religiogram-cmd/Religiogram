import { CITIES, resolveCity } from './cities';
import type { City } from './cities';

// ── CITIES constant ──────────────────────────────────────────────────────────

describe('CITIES', () => {
  it('contains exactly 6 launch cities', () => {
    expect(CITIES).toHaveLength(6);
  });

  it('each city has the required shape', () => {
    for (const city of CITIES) {
      expect(typeof city.slug).toBe('string');
      expect(city.slug.length).toBeGreaterThan(0);
      expect(typeof city.displayName).toBe('string');
      expect(city.displayName.length).toBeGreaterThan(0);
      expect(typeof city.lat).toBe('number');
      expect(typeof city.lng).toBe('number');
    }
  });

  it('all slugs are lowercase letters only (no spaces or special chars)', () => {
    for (const city of CITIES) {
      expect(city.slug).toMatch(/^[a-z]+$/);
    }
  });

  it('all slugs are unique', () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('latitudes are in the valid Indian range (8°–37° N)', () => {
    for (const city of CITIES) {
      expect(city.lat).toBeGreaterThanOrEqual(8);
      expect(city.lat).toBeLessThanOrEqual(37);
    }
  });

  it('longitudes are in the valid Indian range (68°–97° E)', () => {
    for (const city of CITIES) {
      expect(city.lng).toBeGreaterThanOrEqual(68);
      expect(city.lng).toBeLessThanOrEqual(97);
    }
  });

  it('includes delhi, mumbai, kolkata', () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(slugs).toContain('delhi');
    expect(slugs).toContain('mumbai');
    expect(slugs).toContain('kolkata');
  });

  it('includes varanasi — the primary temple city', () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(slugs).toContain('varanasi');
  });

  it('Delhi displayName is "Delhi"', () => {
    const delhi = CITIES.find((c) => c.slug === 'delhi');
    expect(delhi?.displayName).toBe('Delhi');
  });
});

// ── resolveCity() ────────────────────────────────────────────────────────────

describe('resolveCity()', () => {
  it('returns the City object for a known slug', () => {
    const city = resolveCity('delhi');
    expect(city).not.toBeNull();
    expect(city!.slug).toBe('delhi');
    expect(city!.displayName).toBe('Delhi');
  });

  it('resolves correctly for all 6 launch cities', () => {
    for (const expected of CITIES) {
      const resolved = resolveCity(expected.slug);
      expect(resolved).toEqual(expected);
    }
  });

  it('is case-insensitive (resolves "DELHI" → delhi)', () => {
    const city = resolveCity('DELHI');
    expect(city).not.toBeNull();
    expect(city!.slug).toBe('delhi');
  });

  it('is case-insensitive for mixed case (resolves "Mumbai" → mumbai)', () => {
    const city = resolveCity('Mumbai');
    expect(city).not.toBeNull();
    expect(city!.slug).toBe('mumbai');
  });

  it('returns null for an unknown slug', () => {
    expect(resolveCity('hyderabad')).toBeNull();
  });

  it('returns null for null', () => {
    expect(resolveCity(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(resolveCity(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(resolveCity('')).toBeNull();
  });

  it('returned object has correct lat/lng for varanasi', () => {
    const city = resolveCity('varanasi');
    expect(city).not.toBeNull();
    expect(city!.lat).toBeCloseTo(25.3176, 3);
    expect(city!.lng).toBeCloseTo(82.9739, 3);
  });
});
