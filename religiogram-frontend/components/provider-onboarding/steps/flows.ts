/**
 * Per-flow labels and totalSteps constants.
 *
 * Each of the three sub-flows (priest, astrologer, both) has its own
 * ordered list of step labels. The route pages read them out of here and
 * pass the appropriate `FlowConfig` down to shared step components.
 */

export const PRIEST_STEP_LABELS: Record<number, string> = {
  1: 'Basic details',
  2: 'About your work',
  3: 'Your faith',
  4: 'Services',
  5: 'Pricing',
  6: 'Availability',
  7: 'Verify yourself',
  8: 'Identity documents',
  9: 'Payout setup',
};
export const PRIEST_TOTAL_STEPS = 9;
export const PRIEST_ROUTE_BASE = '/provider-onboarding/priest';

export const ASTROLOGER_STEP_LABELS: Record<number, string> = {
  1: 'Basic details',
  2: 'About your work',
  3: 'Specialisations',
  4: 'Consultation channels',
  5: 'Per-minute rate',
  6: 'Online availability',
  7: 'Verify yourself',
  8: 'Identity documents',
  9: 'Payout setup',
};
export const ASTROLOGER_TOTAL_STEPS = 9;
export const ASTROLOGER_ROUTE_BASE = '/provider-onboarding/astrologer';

export const BOTH_STEP_LABELS: Record<number, string> = {
  1: 'Basic details',
  2: 'About your work',
  3: 'Your faith',
  4: 'Poojas & services',
  5: 'Per-booking pricing',
  6: 'In-person availability',
  7: 'Specialisations',
  8: 'Consultation channels',
  9: 'Per-minute rate',
  10: 'Verify yourself',
  11: 'Identity documents',
  12: 'Payout setup',
};
export const BOTH_TOTAL_STEPS = 12;
export const BOTH_ROUTE_BASE = '/provider-onboarding/both';
