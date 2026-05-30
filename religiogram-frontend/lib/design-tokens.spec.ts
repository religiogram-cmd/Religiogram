import { colors, gradients, shadows, radii, spacing, typography, zIndex } from './design-tokens';

// ── colors ───────────────────────────────────────────────────────────────────

describe('colors', () => {
  it('exports a non-empty object', () => {
    expect(typeof colors).toBe('object');
    expect(Object.keys(colors).length).toBeGreaterThan(0);
  });

  it('contains the expected semantic keys', () => {
    expect(colors).toHaveProperty('success');
    expect(colors).toHaveProperty('error');
    expect(colors).toHaveProperty('warning');
    expect(colors).toHaveProperty('info');
  });

  it('contains background keys', () => {
    expect(colors).toHaveProperty('bgParchment');
    expect(colors).toHaveProperty('bgWarm');
    expect(colors).toHaveProperty('bgCard');
    expect(colors).toHaveProperty('bgCardSolid');
  });

  it('contains brand gold keys', () => {
    expect(colors).toHaveProperty('gold');
    expect(colors).toHaveProperty('goldLight');
    expect(colors).toHaveProperty('goldDark');
  });

  it('contains text keys', () => {
    expect(colors).toHaveProperty('textPrimary');
    expect(colors).toHaveProperty('textSecondary');
    expect(colors).toHaveProperty('textMuted');
    expect(colors).toHaveProperty('textInverse');
  });

  it('success/error/warning/info are valid hex or rgb strings', () => {
    const semanticColors = [colors.success, colors.error, colors.warning, colors.info];
    for (const c of semanticColors) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{3,8}$|^rgb/);
    }
  });

  it('textInverse is white (#ffffff)', () => {
    expect(colors.textInverse.toLowerCase()).toBe('#ffffff');
  });
});

// ── gradients ────────────────────────────────────────────────────────────────

describe('gradients', () => {
  it('exports a non-empty object', () => {
    expect(Object.keys(gradients).length).toBeGreaterThan(0);
  });

  it('each gradient value is a CSS gradient string', () => {
    for (const val of Object.values(gradients)) {
      expect(typeof val).toBe('string');
      expect(val).toMatch(/gradient/);
    }
  });

  it('contains "gold" and "bgHero"', () => {
    expect(gradients).toHaveProperty('gold');
    expect(gradients).toHaveProperty('bgHero');
  });
});

// ── shadows ──────────────────────────────────────────────────────────────────

describe('shadows', () => {
  it('exports a non-empty object', () => {
    expect(Object.keys(shadows).length).toBeGreaterThan(0);
  });

  it('contains card / button shadow keys', () => {
    expect(shadows).toHaveProperty('card');
    expect(shadows).toHaveProperty('cardHover');
    expect(shadows).toHaveProperty('button');
    expect(shadows).toHaveProperty('buttonHover');
  });

  it('each shadow value is a non-empty string', () => {
    for (const val of Object.values(shadows)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    }
  });
});

// ── radii ────────────────────────────────────────────────────────────────────

describe('radii', () => {
  it('all values end with "px" or are the full token "9999px"', () => {
    for (const val of Object.values(radii)) {
      expect(val).toMatch(/^\d+px$/);
    }
  });

  it('full is "9999px"', () => {
    expect(radii.full).toBe('9999px');
  });

  it('sm < md < lg (numeric comparison)', () => {
    const parse = (v: string) => parseInt(v, 10);
    expect(parse(radii.sm)).toBeLessThan(parse(radii.md));
    expect(parse(radii.md)).toBeLessThan(parse(radii.lg));
  });
});

// ── spacing ──────────────────────────────────────────────────────────────────

describe('spacing', () => {
  it('has pageX, sectionGap, cardPad keys', () => {
    expect(spacing).toHaveProperty('pageX');
    expect(spacing).toHaveProperty('sectionGap');
    expect(spacing).toHaveProperty('cardPad');
  });

  it('all values end with "px"', () => {
    for (const val of Object.values(spacing)) {
      expect(val).toMatch(/^\d+px$/);
    }
  });
});

// ── typography ───────────────────────────────────────────────────────────────

describe('typography', () => {
  it('has fontSerif, fontBrand, fontSans', () => {
    expect(typography).toHaveProperty('fontSerif');
    expect(typography).toHaveProperty('fontBrand');
    expect(typography).toHaveProperty('fontSans');
  });

  it('all font stacks are non-empty strings', () => {
    for (const val of Object.values(typography)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    }
  });
});

// ── zIndex ───────────────────────────────────────────────────────────────────

describe('zIndex', () => {
  it('has expected keys', () => {
    expect(zIndex).toHaveProperty('base');
    expect(zIndex).toHaveProperty('nav');
    expect(zIndex).toHaveProperty('modal');
    expect(zIndex).toHaveProperty('toast');
  });

  it('all values are non-negative integers', () => {
    for (const val of Object.values(zIndex)) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('z-order respects: base < card < sticky < nav < modal < toast', () => {
    expect(zIndex.base).toBeLessThan(zIndex.card);
    expect(zIndex.card).toBeLessThan(zIndex.sticky);
    expect(zIndex.sticky).toBeLessThan(zIndex.nav);
    expect(zIndex.nav).toBeLessThan(zIndex.modal);
    expect(zIndex.modal).toBeLessThan(zIndex.toast);
  });
});
