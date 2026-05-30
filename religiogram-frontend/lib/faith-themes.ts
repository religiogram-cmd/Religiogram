/**
 * Multi-faith theme engine.
 *
 * Each religion gets its own color palette; UI components read from the
 * active theme via useTheme(). Defaults to 'universal' (golden parchment)
 * when no religion is selected.
 *
 * Blueprint §4.1 — config-driven, not hardcoded.
 */

export type FaithSlug = 'hindu' | 'islam' | 'sikhism' | 'christianity' | 'universal';

export interface FaithTheme {
  slug: FaithSlug;
  label: string;
  /** Primary brand color */
  primary: string;
  /** Lighter tint of primary */
  primaryLight: string;
  /** Darker shade of primary */
  primaryDark: string;
  /** Accent — used for highlights, badges */
  accent: string;
  /** Page/card background */
  bg: string;
  /** Warm card background */
  bgCard: string;
  /** Hero gradient (CSS string) */
  heroGradient: string;
  /** Button gradient */
  btnGradient: string;
  /** Emoji icon for the faith */
  icon: string;
}

export const FAITH_THEMES: Record<FaithSlug, FaithTheme> = {
  universal: {
    slug: 'universal',
    label: 'All Faiths',
    primary: '#C8932A',
    primaryLight: '#F5E9D8',
    primaryDark: '#9A7B1E',
    accent: '#0F2452',
    bg: '#F5E9D8',
    bgCard: '#FFFCF5',
    heroGradient: 'linear-gradient(135deg, #C8932A 0%, #9A7B1E 100%)',
    btnGradient: 'linear-gradient(135deg, #C8932A, #9A7B1E)',
    icon: '🕊️',
  },
  hindu: {
    slug: 'hindu',
    label: 'Hindu',
    primary: '#D4580A',     // saffron
    primaryLight: '#FDF0E6',
    primaryDark: '#A33E06',
    accent: '#9B2335',
    bg: '#FEF3E9',
    bgCard: '#FFFAF5',
    heroGradient: 'linear-gradient(135deg, #D4580A 0%, #9B2335 100%)',
    btnGradient: 'linear-gradient(135deg, #D4580A, #A33E06)',
    icon: '🕉️',
  },
  islam: {
    slug: 'islam',
    label: 'Islam',
    primary: '#1B7A4A',     // green
    primaryLight: '#E8F5EE',
    primaryDark: '#145C38',
    accent: '#C9A847',
    bg: '#F0F9F4',
    bgCard: '#F8FDF9',
    heroGradient: 'linear-gradient(135deg, #1B7A4A 0%, #0E4D2F 100%)',
    btnGradient: 'linear-gradient(135deg, #1B7A4A, #145C38)',
    icon: '☪️',
  },
  sikhism: {
    slug: 'sikhism',
    label: 'Sikhism',
    primary: '#2B5EAB',     // blue
    primaryLight: '#EAF0FA',
    primaryDark: '#1D4280',
    accent: '#F5A623',
    bg: '#EEF4FF',
    bgCard: '#F7F9FF',
    heroGradient: 'linear-gradient(135deg, #2B5EAB 0%, #1D4280 100%)',
    btnGradient: 'linear-gradient(135deg, #2B5EAB, #1D4280)',
    icon: '🪯',
  },
  christianity: {
    slug: 'christianity',
    label: 'Christianity',
    primary: '#6B3FA0',     // purple
    primaryLight: '#F3EDF9',
    primaryDark: '#4E2D75',
    accent: '#C0A060',
    bg: '#F8F2FF',
    bgCard: '#FBF6FF',
    heroGradient: 'linear-gradient(135deg, #6B3FA0 0%, #4E2D75 100%)',
    btnGradient: 'linear-gradient(135deg, #6B3FA0, #4E2D75)',
    icon: '✝️',
  },
};

export function getTheme(slug?: string | null): FaithTheme {
  return FAITH_THEMES[(slug as FaithSlug) ?? 'universal'] ?? FAITH_THEMES.universal;
}
