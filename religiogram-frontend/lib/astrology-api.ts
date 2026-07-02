/**
 * Astrology API client + mock data.
 *
 * Phase 1 keeps things simple: real horoscope + zodiac data come from the
 * backend (already implemented in NestJS AstrologyController), while the
 * astrologer marketplace uses realistic mock data client-side so the UI
 * ships tonight. Phase 2 wires the marketplace to a real /astrology/
 * astrologers endpoint that queries the existing `providers` table filtered
 * for astrology specialisations.
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

/* ─────────────────────  Mock astrologer data  ─────────────────────
 * Realistic seed set for Phase 1 UI. Phase 2 swaps this for a real
 * backend query on /astrology/astrologers (backed by the existing
 * `providers` table filtered by astrology specialisation).
 */

const MOCK: Astrologer[] = [
  {
    id: 'a-001',
    name: 'Acharya Vikas Sharma',
    avatarUrl: null,
    isOnline: true, isBusy: false, isLive: false, isVerified: true, isNew: false,
    languages: ['Hindi', 'English', 'Sanskrit'],
    experienceYears: 22,
    qualification: 'Jyotish Acharya, MA (Vedic Studies)',
    specializations: ['Vedic Astrology', 'Marriage', 'Career', 'Kundli'],
    rating: 4.9, reviewCount: 8432,
    ratePerMinPaise: 12000,
    responseTimeSec: 45,
    followers: 45230, completedConsultations: 12480, successRate: 96,
    about: 'A 3rd-generation Vedic astrologer with 22 years of experience guiding families across India on marriage, career, and life-path questions.',
    awards: ['Best Astrologer 2023 — Times Now', 'Featured on NDTV'],
    channels: ['chat', 'voice', 'video'],
    city: 'Varanasi', gender: 'male',
    nextAvailableSlot: 'Now',
  },
  {
    id: 'a-002',
    name: 'Dr. Ananya Iyer',
    avatarUrl: null,
    isOnline: true, isBusy: true, isLive: false, isVerified: true, isNew: false,
    languages: ['English', 'Tamil', 'Malayalam'],
    experienceYears: 14,
    qualification: 'PhD Vedic Astrology, KP Certified',
    specializations: ['KP Astrology', 'Love', 'Marriage', 'Match Making'],
    rating: 4.8, reviewCount: 5210,
    ratePerMinPaise: 8500,
    responseTimeSec: 60,
    followers: 22100, completedConsultations: 7420, successRate: 94,
    about: 'KP-certified astrologer specialising in relationship compatibility, marriage timing, and post-marriage guidance.',
    awards: ['Top Rated 2024'],
    channels: ['chat', 'voice'],
    city: 'Chennai', gender: 'female',
    nextAvailableSlot: 'In 8 min',
  },
  {
    id: 'a-003',
    name: 'Pandit Ravi Krishnan',
    avatarUrl: null,
    isOnline: true, isBusy: false, isLive: true, isVerified: true, isNew: false,
    languages: ['Hindi', 'English', 'Kannada'],
    experienceYears: 30,
    qualification: 'Jyotish Ratna, Nadi Expert',
    specializations: ['Nadi Astrology', 'Vedic Astrology', 'Remedies'],
    rating: 4.9, reviewCount: 12340,
    ratePerMinPaise: 25000,
    responseTimeSec: 30,
    followers: 89200, completedConsultations: 18900, successRate: 97,
    about: 'Senior Nadi astrologer with 30 years of experience. Specialises in life-purpose readings and rare planetary remedies.',
    awards: ['Padma Shri nominee 2022'],
    channels: ['chat', 'voice', 'video'],
    city: 'Bengaluru', gender: 'male',
    nextAvailableSlot: 'Live now',
  },
  {
    id: 'a-004',
    name: 'Riya Kapoor',
    avatarUrl: null,
    isOnline: false, isBusy: false, isLive: false, isVerified: true, isNew: true,
    languages: ['Hindi', 'English', 'Punjabi'],
    experienceYears: 3,
    qualification: 'Certified Tarot Reader, Numerologist',
    specializations: ['Tarot Reading', 'Numerology', 'Love'],
    rating: 4.7, reviewCount: 320,
    ratePerMinPaise: 1500,
    responseTimeSec: 90,
    followers: 1240, completedConsultations: 380, successRate: 92,
    about: 'New-age tarot and numerology reader with a fresh, modern approach. Perfect for Gen-Z relationship questions.',
    awards: [],
    channels: ['chat'],
    city: 'Delhi', gender: 'female',
    nextAvailableSlot: 'Tomorrow 10:00',
  },
  {
    id: 'a-005',
    name: 'Guru Mahesh Bhatt',
    avatarUrl: null,
    isOnline: true, isBusy: false, isLive: false, isVerified: true, isNew: false,
    languages: ['Hindi', 'Marathi', 'Gujarati'],
    experienceYears: 18,
    qualification: 'Lal Kitab Ratna, Vastu Vishesh',
    specializations: ['Lal Kitab', 'Vastu Shastra', 'Remedies'],
    rating: 4.8, reviewCount: 4120,
    ratePerMinPaise: 6000,
    responseTimeSec: 55,
    followers: 15800, completedConsultations: 5680, successRate: 95,
    about: 'Lal Kitab expert and Vastu consultant. 18 years of guiding families on home energy and quick planetary remedies.',
    awards: ['Vastu Excellence 2023'],
    channels: ['chat', 'voice'],
    city: 'Mumbai', gender: 'male',
    nextAvailableSlot: 'In 15 min',
  },
  {
    id: 'a-006',
    name: 'Sadhvi Meera',
    avatarUrl: null,
    isOnline: true, isBusy: false, isLive: false, isVerified: true, isNew: false,
    languages: ['Hindi', 'English', 'Bengali'],
    experienceYears: 12,
    qualification: 'MA Sanskrit, Palmistry Certified',
    specializations: ['Palmistry', 'Face Reading', 'Career', 'Business'],
    rating: 4.6, reviewCount: 2140,
    ratePerMinPaise: 4500,
    responseTimeSec: 70,
    followers: 8900, completedConsultations: 3210, successRate: 93,
    about: 'Palmistry and face-reading specialist with a warm, encouraging style. Career and business focus.',
    awards: [],
    channels: ['chat', 'video'],
    city: 'Kolkata', gender: 'female',
    nextAvailableSlot: 'Now',
  },
  {
    id: 'a-007',
    name: 'Acharya Pranav Joshi',
    avatarUrl: null,
    isOnline: true, isBusy: false, isLive: false, isVerified: true, isNew: false,
    languages: ['Hindi', 'English', 'Sanskrit'],
    experienceYears: 25,
    qualification: 'Jyotish Vachaspati, Gemologist',
    specializations: ['Gemology', 'Rudraksha', 'Vedic Astrology'],
    rating: 4.9, reviewCount: 6890,
    ratePerMinPaise: 15000,
    responseTimeSec: 40,
    followers: 35400, completedConsultations: 9120, successRate: 96,
    about: 'Sr. Vedic astrologer + certified gemologist. Recommends authenticated gemstones and Rudraksha based on birth chart.',
    awards: ['Gemology Excellence Award 2022'],
    channels: ['chat', 'voice', 'video'],
    city: 'Rishikesh', gender: 'male',
    nextAvailableSlot: 'Now',
  },
  {
    id: 'a-008',
    name: 'Neha Verma',
    avatarUrl: null,
    isOnline: false, isBusy: false, isLive: false, isVerified: true, isNew: false,
    languages: ['Hindi', 'English'],
    experienceYears: 8,
    qualification: 'Certified Astrologer, Life Coach',
    specializations: ['Career', 'Love', 'Numerology', 'Remedies'],
    rating: 4.7, reviewCount: 1580,
    ratePerMinPaise: 3500,
    responseTimeSec: 80,
    followers: 5600, completedConsultations: 2100, successRate: 92,
    about: 'Career-focused astrologer and life coach. Practical remedies + honest, clear guidance.',
    awards: [],
    channels: ['chat', 'voice'],
    city: 'Pune', gender: 'female',
    nextAvailableSlot: 'Tomorrow 09:00',
  },
];

/* ─────────────────────────  API surface  ───────────────────────── */

export interface ListFilters {
  channel?: ConsultationChannel;
  language?: string;
  specialization?: string;
  minExperience?: number;
  gender?: 'male' | 'female';
  onlineOnly?: boolean;
  verifiedOnly?: boolean;
  minRating?: number;
  maxPricePaise?: number;
}

export type SortKey = 'popularity' | 'rating' | 'price_asc' | 'price_desc' | 'experience' | 'response';

export function listAstrologers(filters: ListFilters = {}, sort: SortKey = 'popularity'): Astrologer[] {
  let list = MOCK.slice();
  if (filters.channel)         list = list.filter((a) => a.channels.includes(filters.channel!));
  if (filters.language)        list = list.filter((a) => a.languages.includes(filters.language!));
  if (filters.specialization)  list = list.filter((a) => a.specializations.includes(filters.specialization!));
  if (filters.minExperience)   list = list.filter((a) => a.experienceYears >= filters.minExperience!);
  if (filters.gender)          list = list.filter((a) => a.gender === filters.gender);
  if (filters.onlineOnly)      list = list.filter((a) => a.isOnline);
  if (filters.verifiedOnly)    list = list.filter((a) => a.isVerified);
  if (filters.minRating)       list = list.filter((a) => a.rating >= filters.minRating!);
  if (filters.maxPricePaise)   list = list.filter((a) => a.ratePerMinPaise <= filters.maxPricePaise!);

  switch (sort) {
    case 'rating':      list.sort((a, b) => b.rating - a.rating); break;
    case 'price_asc':   list.sort((a, b) => a.ratePerMinPaise - b.ratePerMinPaise); break;
    case 'price_desc':  list.sort((a, b) => b.ratePerMinPaise - a.ratePerMinPaise); break;
    case 'experience':  list.sort((a, b) => b.experienceYears - a.experienceYears); break;
    case 'response':    list.sort((a, b) => a.responseTimeSec - b.responseTimeSec); break;
    default:            list.sort((a, b) => b.followers - a.followers); break;
  }
  return list;
}

export function getAstrologer(id: string): Astrologer | null {
  return MOCK.find((a) => a.id === id) ?? null;
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
