import { getTheme, FAITH_THEMES } from './faith-themes';
import type { FaithSlug, FaithTheme } from './faith-themes';

// ── FAITH_THEMES record ──────────────────────────────────────────────────────

describe('FAITH_THEMES', () => {
  const EXPECTED_SLUGS: FaithSlug[] = ['universal', 'hindu', 'islam', 'sikhism', 'christianity'];

  it('contains exactly 5 faith entries', () => {
    expect(Object.keys(FAITH_THEMES)).toHaveLength(5);
  });

  it('contains all expected slugs', () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(FAITH_THEMES).toHaveProperty(slug);
    }
  });

  it.each(EXPECTED_SLUGS)('"%s" theme has all required FaithTheme fields', (slug) => {
    const theme = FAITH_THEMES[slug];
    expect(theme.slug).toBe(slug);
    expect(typeof theme.label).toBe('string');
    expect(theme.label.length).toBeGreaterThan(0);
    expect(typeof theme.primary).toBe('string');
    expect(typeof theme.primaryLight).toBe('string');
    expect(typeof theme.primaryDark).toBe('string');
    expect(typeof theme.accent).toBe('string');
    expect(typeof theme.bg).toBe('string');
    expect(typeof theme.bgCard).toBe('string');
    expect(typeof theme.heroGradient).toBe('string');
    expect(typeof theme.btnGradient).toBe('string');
    expect(typeof theme.icon).toBe('string');
  });

  it.each(EXPECTED_SLUGS)('"%s" color fields start with # (hex)', (slug) => {
    const theme = FAITH_THEMES[slug];
    for (const field of ['primary', 'primaryLight', 'primaryDark', 'accent', 'bg', 'bgCard'] as const) {
      expect(theme[field]).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
    }
  });

  it.each(EXPECTED_SLUGS)('"%s" gradient fields contain linear-gradient', (slug) => {
    const theme = FAITH_THEMES[slug];
    expect(theme.heroGradient).toContain('linear-gradient');
    expect(theme.btnGradient).toContain('linear-gradient');
  });

  it('hindu theme uses saffron as primary', () => {
    expect(FAITH_THEMES.hindu.primary).toBe('#D4580A');
  });

  it('islam theme uses green as primary', () => {
    expect(FAITH_THEMES.islam.primary).toBe('#1B7A4A');
  });

  it('sikhism theme uses blue as primary', () => {
    expect(FAITH_THEMES.sikhism.primary).toBe('#2B5EAB');
  });

  it('christianity theme uses purple as primary', () => {
    expect(FAITH_THEMES.christianity.primary).toBe('#6B3FA0');
  });
});

// ── getTheme() ───────────────────────────────────────────────────────────────

describe('getTheme()', () => {
  it('returns the universal theme when called with no arguments', () => {
    const theme = getTheme();
    expect(theme.slug).toBe('universal');
  });

  it('returns the universal theme for undefined', () => {
    const theme = getTheme(undefined);
    expect(theme.slug).toBe('universal');
  });

  it('returns the universal theme for null', () => {
    const theme = getTheme(null);
    expect(theme.slug).toBe('universal');
  });

  it('returns the universal theme for an empty string', () => {
    const theme = getTheme('');
    expect(theme.slug).toBe('universal');
  });

  it('returns the universal theme for an unknown slug', () => {
    const theme = getTheme('zoroastrian');
    expect(theme.slug).toBe('universal');
  });

  it('returns the hindu theme for "hindu"', () => {
    const theme = getTheme('hindu');
    expect(theme.slug).toBe('hindu');
    expect(theme.label).toBe('Hindu');
  });

  it('returns the islam theme for "islam"', () => {
    const theme = getTheme('islam');
    expect(theme.slug).toBe('islam');
  });

  it('returns the sikhism theme for "sikhism"', () => {
    const theme = getTheme('sikhism');
    expect(theme.slug).toBe('sikhism');
  });

  it('returns the christianity theme for "christianity"', () => {
    const theme = getTheme('christianity');
    expect(theme.slug).toBe('christianity');
  });

  it('returns the universal theme for "universal"', () => {
    const theme = getTheme('universal');
    expect(theme.slug).toBe('universal');
  });

  it('returned theme is the exact same object reference from FAITH_THEMES', () => {
    expect(getTheme('hindu')).toBe(FAITH_THEMES.hindu);
    expect(getTheme('islam')).toBe(FAITH_THEMES.islam);
    expect(getTheme('universal')).toBe(FAITH_THEMES.universal);
  });

  it('fallback for unknown slug is the same reference as FAITH_THEMES.universal', () => {
    expect(getTheme('noop')).toBe(FAITH_THEMES.universal);
  });
});
