/**
 * Astrology API client.
 *
 * The marketplace list + profile page are wired to the real
 * `GET /v1/providers` endpoint (filtered by `?category=astrologer`).
 *
 * REAL DATA ONLY. There is no MOCK fallback — the previous seed array of
 * fake astrologer profiles was deleted per product policy. If the backend
 * returns zero astrologers, the marketplace shows a proper empty state
 * ("No astrologers available right now") rather than surface synthetic
 * humans as filler.
 *
 * Horoscope data (fetchHoroscope) comes from the backend AstrologyController.
 */

import { apiFetch } from '@/lib/api';

/* ─────────────────────────────  Types  ───────────────────────────── */

export type ConsultationChannel = 'chat' | 'voice' | 'video';

export interface Astrologer {
  id: string;
  name: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isBusy: boolean;
  isLive: boolean;
  isVerified: boolean;
  isNew: boolean;
  languages: string[];
  experienceYears: number;
  qualification: string;
  specializations: string[];
  /** Optional per-spec years map — populated when the provider row has
   *  `specialisation_years` (Phase 2). Keyed by the spec label. */
  specializationYears?: Record<string, number>;
  rating: number;                 // 0-5
  reviewCount: number;
  ratePerMinPaise: number;        // ₹ = paise / 100
  responseTimeSec: number;
  followers: number;
  completedConsultations: number;
  successRate: number;            // percentage
  about: string;
  awards: string[];
  channels: ConsultationChannel[];
  city: string;
  gender: 'male' | 'female';
  nextAvailableSlot: string | null;
}

export interface Horoscope {
  sign: string;
  symbol: string;
  dateRange: string;
  element: string;
  rulingPlanet: string;
  reading: string;
  traits: string[];
  luckyColor: string;
  luckyNumber: number;
  luckyTime: string;
  luckyDirection: string;
  remedy: string;
  compatibility: string[];
}

/* ────────────────────────  Zodiac static  ───────────────────────── */

export const ZODIAC_SIGNS = [
  { name: 'aries',       symbol: '♈', label: 'Aries',       dateRange: 'Mar 21 – Apr 19', color: '#E63946' },
  { name: 'taurus',      symbol: '♉', label: 'Taurus',      dateRange: 'Apr 20 – May 20', color: '#2A9D8F' },
  { name: 'gemini',      symbol: '♊', label: 'Gemini',      dateRange: 'May 21 – Jun 20', color: '#F4A261' },
  { name: 'cancer',      symbol: '♋', label: 'Cancer',      dateRange: 'Jun 21 – Jul 22', color: '#8ECAE6' },
  { name: 'leo',         symbol: '♌', label: 'Leo',         dateRange: 'Jul 23 – Aug 22', color: '#FFB703' },
  { name: 'virgo',       symbol: '♍', label: 'Virgo',       dateRange: 'Aug 23 – Sep 22', color: '#95D5B2' },
  { name: 'libra',       symbol: '♎', label: 'Libra',       dateRange: 'Sep 23 – Oct 22', color: '#F1B0B7' },
  { name: 'scorpio',     symbol: '♏', label: 'Scorpio',     dateRange: 'Oct 23 – Nov 21', color: '#6A0572' },
  { name: 'sagittarius', symbol: '♐', label: 'Sagittarius', dateRange: 'Nov 22 – Dec 21', color: '#3A86FF' },
  { name: 'capricorn',   symbol: '♑', label: 'Capricorn',   dateRange: 'Dec 22 – Jan 19', color: '#4A5859' },
  { name: 'aquarius',    symbol: '♒', label: 'Aquarius',    dateRange: 'Jan 20 – Feb 18', color: '#00B4D8' },
  { name: 'pisces',      symbol: '♓', label: 'Pisces',      dateRange: 'Feb 19 – Mar 20', color: '#7209B7' },
] as const;

export const SPECIALIZATIONS = [
  'Vedic Astrology', 'KP Astrology', 'Nadi Astrology', 'Western Astrology',
  'Numerology', 'Tarot Reading', 'Palmistry', 'Face Reading', 'Vastu Shastra',
  'Lal Kitab', 'Gemology', 'Rudraksha', 'Marriage', 'Career', 'Love',
  'Business', 'Health', 'Match Making', 'Muhurat', 'Kundli',
] as const;

export const CATEGORIES = [
  { key: 'love',        label: 'Love',        icon: '💗' },
  { key: 'marriage',    label: 'Marriage',    icon: '💍' },
  { key: 'career',      label: 'Career',      icon: '💼' },
  { key: 'business',    label: 'Business',    icon: '📈' },
  { key: 'health',      label: 'Health',      icon: '🌿' },
  { key: 'education',   label: 'Education',   icon: '🎓' },
  { key: 'finance',     label: 'Finance',     icon: '💰' },
  { key: 'family',      label: 'Family',      icon: '👪' },
  { key: 'children',    label: 'Children',    icon: '🧒' },
  { key: 'compatibility',label:'Compatibility',icon:'🔗' },
  { key: 'remedies',    label: 'Remedies',    icon: '🕉️' },
  { key: 'muhurat',     label: 'Muhurat',     icon: '📿' },
] as const;

/* Mock astrologer data REMOVED. This app is real-data only — we do not
 * surface synthetic humans as filler. If the backend returns zero
 * astrologers, the marketplace shows a proper empty state instead. */

/* ─────────────────────────  API surface  ───────────────────────── */

export interface ListFilters {
  channel?: ConsultationChannel;
  channels?: ConsultationChannel[];               // multi-select from the sheet
  language?: string;
  languages?: string[];                            // multi
  specialization?: string;
  specializations?: string[];                      // multi
  availability?: string[];                         // section-1 keys ('online','chat','voice','video','busy','offline','today')
  minExperience?: number;
  maxExperience?: number;
  experienceBands?: string[];                      // '0-3','3-5','5-10','10-15','15-20','20+'
  gender?: 'male' | 'female' | 'other';
  onlineOnly?: boolean;
  verifiedOnly?: boolean;
  verificationBadges?: string[];                   // 'verified','kyc','certified'
  minRating?: number;
  minPricePaise?: number;
  maxPricePaise?: number;
  topics?: string[];                               // consultation topics (aliased to specialisations today)
}

export type SortKey = 'popularity' | 'rating' | 'price_asc' | 'price_desc' | 'experience' | 'response';

/* ─────────────────────────  Backend mapping  ─────────────────────── */

/** Shape of a provider row as returned by `GET /v1/providers`. */
interface BackendProvider {
  id: string;
  fullName: string;
  city: string | null;
  religion?: string | null;
  experienceYears: number | null;
  languages: string[];
  bio: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  providerCategory: 'priest' | 'astrologer' | 'both';
  specialisations: string[];
  specialisationYears?: Record<string, number>;
  consultationChannels: ConsultationChannel[];
  perMinutePaise: number | null;
  serviceMode: 'offline' | 'online' | 'both';
  isOnline?: boolean;
  isVerified?: boolean;
  completedBookings?: number;
  createdAt?: string;
}

/** Map a backend Provider to the frontend Astrologer view model. Any field
 *  the backend doesn't send (avatarUrl, qualification, followers, gender,
 *  awards, nextAvailableSlot) gets a reasonable default so the UI still
 *  renders without conditionals everywhere. */
function toAstrologer(p: BackendProvider): Astrologer {
  const createdMs = p.createdAt ? new Date(p.createdAt).getTime() : Date.now();
  const daysSinceCreate = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  return {
    id:                     p.id,
    name:                   p.fullName,
    avatarUrl:              null,
    isOnline:               !!p.isOnline,
    isBusy:                 false, // not tracked yet
    isLive:                 false, // not tracked yet
    isVerified:             !!p.isVerified,
    isNew:                  daysSinceCreate < 30,
    languages:              p.languages ?? [],
    experienceYears:        p.experienceYears ?? 0,
    qualification:          '',
    specializations:        p.specialisations ?? [],
    specializationYears:    p.specialisationYears ?? {},
    rating:                 p.ratingAvg ?? 0,
    reviewCount:            p.ratingCount ?? 0,
    ratePerMinPaise:        p.perMinutePaise ?? 0,
    responseTimeSec:        p.isOnline ? 60 : 900, // heuristic until we track it
    followers:              0, // not tracked yet
    completedConsultations: p.completedBookings ?? 0,
    successRate:            p.ratingAvg ? Math.round((p.ratingAvg / 5) * 100) : 0,
    about:                  p.bio ?? '',
    awards:                 [],
    channels:               p.consultationChannels ?? [],
    city:                   p.city ?? '',
    gender:                 'male', // not collected; default won't affect filter unless user picks it
    nextAvailableSlot:      null,
  };
}

/* ─────────────────────────  Marketplace API  ─────────────────────── */

const API_BASE = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/v1';
  }
  return 'https://api.religiogram.com/api/v1';
})();

async function fetchProviders(qs: string): Promise<BackendProvider[]> {
  const res = await fetch(`${API_BASE}/providers${qs}`);
  if (!res.ok) throw new Error(`Providers fetch failed (${res.status})`);
  const json = await res.json();
  return (json.items ?? []) as BackendProvider[];
}

/**
 * Fetch astrologers from the backend, apply client-side filters + sort.
 *
 * Backend natively filters by category / specialisation / channel via query
 * params. Everything else (language, minExperience, gender, onlineOnly,
 * verifiedOnly, minRating, maxPricePaise) is client-side today — the list
 * is small enough that shipping filters piecewise on the server isn't worth
 * the coupling. When the list crosses 500-ish rows we push these down.
 *
 * Returns whatever the real backend serves. If the fetch fails or the DB
 * is empty, an empty list is returned so the UI shows a proper empty
 * state — we do NOT surface fake humans to real users.
 */
export async function listAstrologers(
  filters: ListFilters = {},
  sort: SortKey = 'popularity',
): Promise<Astrologer[]> {
  const params = new URLSearchParams();
  params.set('category', 'astrologer');

  // Server-side narrowing: send ONE specialisation + ONE channel when arrays
  // are supplied, take the first entry. The remaining values in the array
  // apply client-side. Legacy singular fields still win if set.
  const serverSpec    = filters.specialization ?? filters.specializations?.[0];
  const serverChannel = filters.channel        ?? filters.channels?.[0];
  if (serverSpec)    params.set('specialisation', serverSpec);
  if (serverChannel) params.set('channel', serverChannel);
  const qs = `?${params.toString()}`;

  let list: Astrologer[] = [];
  try {
    const rows = await fetchProviders(qs);
    list = rows.map(toAstrologer);
  } catch {
    /* network failure — return empty. The UI renders a proper empty
     * state ("No astrologers available right now"); we never show fake
     * humans as filler. */
    list = [];
  }

  /* ─── Client-side filters ───────────────────────────────────────────
   * DATA CAVEATS (backend doesn't track these yet — filters below are
   * best-effort / no-op pass-through so the UI still works):
   *   • gender          — Provider entity has no gender field; the mapper
   *                       defaults every row to 'male', so picking Female
   *                       or Other will yield 0 rows.
   *   • topics          — same list as specialisations for now (aliased).
   *   • availability
   *     ├─ 'busy'       — isBusy not tracked → pass-through (ignored).
   *     └─ 'today'      — availableToday not tracked → pass-through.
   *   • verificationBadges
   *     ├─ 'kyc'        — treated as alias of isVerified.
   *     └─ 'certified'  — treated as alias of isVerified.
   *     TODO(phase-3): split KYC + certification into distinct badges.
   * ------------------------------------------------------------------- */

  // Multi-channel: astrologer must offer at least one selected channel
  if (filters.channels && filters.channels.length > 0) {
    list = list.filter((a) => filters.channels!.some((c) => a.channels.includes(c)));
  }

  // Language (singular OR multi)
  if (filters.language) {
    list = list.filter((a) => a.languages.includes(filters.language!));
  }
  if (filters.languages && filters.languages.length > 0) {
    list = list.filter((a) => filters.languages!.some((l) => a.languages.includes(l)));
  }

  // Multi-specialisation: astrologer must have at least one selected
  if (filters.specializations && filters.specializations.length > 0) {
    list = list.filter((a) => filters.specializations!.some((s) => a.specializations.includes(s)));
  }

  // Topics: aliased to specialisations
  if (filters.topics && filters.topics.length > 0) {
    list = list.filter((a) => filters.topics!.some((t) => a.specializations.includes(t)));
  }

  // Availability
  if (filters.availability && filters.availability.length > 0) {
    const av = filters.availability;
    list = list.filter((a) => {
      // Any-of semantics: astrologer passes if it matches ANY selected key
      let ok = false;
      if (av.includes('online')  && a.isOnline && !a.isBusy)     ok = true;
      if (av.includes('chat')    && a.channels.includes('chat')  && a.isOnline) ok = true;
      if (av.includes('voice')   && a.channels.includes('voice') && a.isOnline) ok = true;
      if (av.includes('video')   && a.channels.includes('video') && a.isOnline) ok = true;
      if (av.includes('offline') && !a.isOnline)                  ok = true;
      // 'busy' and 'today' — data not tracked → treat as pass-through
      // (contributes ok=true so selection alone doesn't hide everyone).
      if (av.includes('busy'))    ok = true;
      if (av.includes('today'))   ok = true;
      return ok;
    });
  }

  // Experience: singular range wins; else map bands to ranges (any-of)
  if (filters.minExperience !== undefined) {
    list = list.filter((a) => a.experienceYears >= filters.minExperience!);
  }
  if (filters.maxExperience !== undefined) {
    list = list.filter((a) => a.experienceYears <= filters.maxExperience!);
  }
  if (filters.experienceBands && filters.experienceBands.length > 0) {
    const bandRanges: Record<string, [number, number]> = {
      '0-3':   [0, 3],
      '3-5':   [3, 5],
      '5-10':  [5, 10],
      '10-15': [10, 15],
      '15-20': [15, 20],
      '20+':   [20, 999],
    };
    list = list.filter((a) =>
      filters.experienceBands!.some((band) => {
        const r = bandRanges[band];
        return r && a.experienceYears >= r[0] && a.experienceYears <= r[1];
      }),
    );
  }

  // Gender — no-op today. Provider entity has no gender column so every
  // real row is defaulted to 'male' by the mapper; selecting Female or
  // Other will yield zero results until the backend tracks this.
  if (filters.gender) {
    list = list.filter((a) => (a.gender as string) === filters.gender);
  }

  // Online + verified flags
  if (filters.onlineOnly)   list = list.filter((a) => a.isOnline);
  if (filters.verifiedOnly) list = list.filter((a) => a.isVerified);

  // Verification badges — all currently alias to isVerified
  if (filters.verificationBadges && filters.verificationBadges.length > 0) {
    list = list.filter((a) => a.isVerified);
  }

  if (filters.minRating)      list = list.filter((a) => a.rating >= filters.minRating!);
  if (filters.minPricePaise)  list = list.filter((a) => a.ratePerMinPaise >= filters.minPricePaise!);
  if (filters.maxPricePaise)  list = list.filter((a) => a.ratePerMinPaise <= filters.maxPricePaise!);

  // Backend already orders by ranking_score. We only re-sort when the user
  // asks for a different order.
  switch (sort) {
    case 'rating':      list.sort((a, b) => b.rating - a.rating); break;
    case 'price_asc':   list.sort((a, b) => a.ratePerMinPaise - b.ratePerMinPaise); break;
    case 'price_desc':  list.sort((a, b) => b.ratePerMinPaise - a.ratePerMinPaise); break;
    case 'experience':  list.sort((a, b) => b.experienceYears - a.experienceYears); break;
    case 'response':    list.sort((a, b) => a.responseTimeSec - b.responseTimeSec); break;
    /* 'popularity' — trust the backend's ranking_score DESC ordering. */
  }
  return list;
}

export async function getAstrologer(id: string): Promise<Astrologer | null> {
  try {
    const res = await fetch(`${API_BASE}/providers/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Provider fetch failed (${res.status})`);
    const raw = await res.json() as BackendProvider;
    return toAstrologer(raw);
  } catch {
    /* Real-only policy: no mock fallback. If the backend can't serve
     * the profile the caller renders "Astrologer not found". */
    return null;
  }
}

/** Real backend call — /astrology/horoscope/:sign is already implemented. */
export async function fetchHoroscope(sign: string): Promise<Horoscope | null> {
  try {
    const raw = await apiFetch<{
      sign: string; date: string; horoscope: string; element: string;
      rulingPlanet: string; traits: string[]; compatibility: string[];
      dateRange: string; symbol: string;
    }>(`/astrology/horoscope/${sign}`, { auth: false });
    return {
      sign: raw.sign,
      symbol: raw.symbol,
      dateRange: raw.dateRange,
      element: raw.element,
      rulingPlanet: raw.rulingPlanet,
      reading: raw.horoscope,
      traits: raw.traits,
      compatibility: raw.compatibility,
      luckyColor:      pickDeterministic(['Gold', 'Ruby Red', 'Emerald', 'Sapphire Blue', 'Pearl White', 'Coral Orange'], sign),
      luckyNumber:     Number(pickDeterministic(['3', '7', '9', '11', '18', '21', '27'], sign + '-n')),
      luckyTime:       pickDeterministic(['7:00 AM – 9:00 AM', '11:00 AM – 1:00 PM', '4:00 PM – 6:00 PM', '9:00 PM – 11:00 PM'], sign + '-t'),
      luckyDirection:  pickDeterministic(['North', 'East', 'North-East', 'South-East', 'West'], sign + '-d'),
      remedy:          pickDeterministic([
        'Offer water to the Sun at sunrise',
        'Light a diya at your home altar',
        'Chant the Gayatri mantra 11 times',
        'Donate rice or wheat to those in need',
        'Wear or touch a piece of copper today',
        'Visit a temple after sunset',
      ], sign + '-r'),
    };
  } catch {
    return null;
  }
}

/** Pick a stable value from a list based on a seed — same seed always
 *  returns the same value, so daily lucky data is consistent per sign. */
function pickDeterministic<T>(list: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/** Rupees display: 12000 paise → "₹120" */
export function formatRupees(paise: number): string {
  return `₹${Math.round(paise / 100)}`;
}
