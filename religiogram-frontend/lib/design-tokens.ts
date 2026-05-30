/**
 * ReligioGram Design System — Single source of truth.
 * Every colour, shadow, radius, and spacing value lives here.
 * Import in components: import { colors, shadows } from '@/lib/design-tokens'
 */

export const colors = {
  /* Backgrounds */
  bgParchment: '#F5E9D8',
  bgWarm: '#F6F7FA',
  bgCard: 'rgba(255, 252, 245, 0.88)',
  bgCardSolid: '#FFFCF5',

  /* Brand gold */
  goldLight: '#C8932A',
  gold: '#C8932A',
  goldDark: '#0F2452',
  goldDeep: '#6B3F1D',

  /* Text */
  textPrimary: '#0F2452',
  textSecondary: '#0F2452',
  textMuted: 'rgba(107, 63, 29, 0.55)',
  textInverse: '#ffffff',

  /* Semantic */
  success: '#27AE60',
  error: '#E74C3C',
  warning: '#E67E22',
  info: '#2980B9',

  /* Borders */
  borderLight: 'rgba(197, 138, 75, 0.18)',
  borderMid: 'rgba(197, 138, 75, 0.3)',
  borderStrong: '#C8932A',
} as const;

export const gradients = {
  gold: 'linear-gradient(140deg, #C8932A 0%, #C8932A 48%, #9A7B1E 100%)',
  goldText: 'linear-gradient(130deg, #C8932A, #C8932A 50%, #0F2452)',
  bgHero: 'radial-gradient(ellipse 130% 60% at 50% -5%, #E8DFD0 0%, #F6F7FA 45%, #F0EBE0 100%)',
  bgPage: 'radial-gradient(ellipse 120% 60% at 50% -10%, #E8DFD0 0%, #F6F7FA 50%, #F0EBE0 100%)',
  logoBadge: 'linear-gradient(145deg, #C8932A 0%, #C8932A 55%, #0F2452 100%)',
} as const;

export const shadows = {
  card: '0 2px 12px rgba(107, 63, 29, 0.07), inset 0 1px 0 rgba(255,255,255,.8)',
  cardHover: '0 8px 28px rgba(169, 113, 66, 0.18), inset 0 1px 0 rgba(255,255,255,.9)',
  cardSelected: '0 8px 32px rgba(169, 113, 66, 0.22), inset 0 1px 0 rgba(255,255,255,.9)',
  button: '0 5px 20px rgba(169, 113, 66, 0.42), inset 0 1px 0 rgba(255,255,255,.18)',
  buttonHover: '0 10px 32px rgba(169, 113, 66, 0.5)',
  logo: '0 6px 20px rgba(169, 113, 66, 0.4), inset 0 1.5px 0 rgba(255,255,255,.25)',
  sm: '0 1px 4px rgba(107, 63, 29, 0.08)',
  md: '0 4px 16px rgba(107, 63, 29, 0.1)',
  lg: '0 12px 40px rgba(107, 63, 29, 0.14)',
} as const;

export const radii = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  full: '9999px',
} as const;

export const spacing = {
  pageX: '20px',
  sectionGap: '24px',
  cardPad: '16px',
} as const;

export const typography = {
  fontSerif: "'Playfair Display', Georgia, serif",
  fontBrand: "'Cinzel', Georgia, serif",
  fontSans: "'Inter', system-ui, sans-serif",
} as const;

export const zIndex = {
  base: 0,
  card: 1,
  sticky: 10,
  nav: 20,
  modal: 50,
  toast: 100,
} as const;
