import { Injectable } from '@nestjs/common';
import { AiChatDto } from './dto/ai-chat.dto';
import { KundliDto } from './dto/kundli.dto';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

export interface ZodiacSign {
  name: string;
  symbol: string;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
  dateRange: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  traits: string[];
  ruling_planet: string;
  compatibility: string[];
}

export const ZODIAC_DATA: ZodiacSign[] = [
  {
    name: 'aries', symbol: '♈', element: 'Fire', dateRange: 'Mar 21 – Apr 19',
    startMonth: 3, startDay: 21, endMonth: 4, endDay: 19,
    traits: ['bold', 'ambitious', 'energetic', 'confident', 'impulsive'],
    ruling_planet: 'Mars', compatibility: ['leo', 'sagittarius', 'gemini'],
  },
  {
    name: 'taurus', symbol: '♉', element: 'Earth', dateRange: 'Apr 20 – May 20',
    startMonth: 4, startDay: 20, endMonth: 5, endDay: 20,
    traits: ['patient', 'reliable', 'devoted', 'stubborn', 'sensual'],
    ruling_planet: 'Venus', compatibility: ['virgo', 'capricorn', 'cancer'],
  },
  {
    name: 'gemini', symbol: '♊', element: 'Air', dateRange: 'May 21 – Jun 20',
    startMonth: 5, startDay: 21, endMonth: 6, endDay: 20,
    traits: ['curious', 'versatile', 'witty', 'indecisive', 'sociable'],
    ruling_planet: 'Mercury', compatibility: ['libra', 'aquarius', 'aries'],
  },
  {
    name: 'cancer', symbol: '♋', element: 'Water', dateRange: 'Jun 21 – Jul 22',
    startMonth: 6, startDay: 21, endMonth: 7, endDay: 22,
    traits: ['intuitive', 'nurturing', 'loyal', 'moody', 'protective'],
    ruling_planet: 'Moon', compatibility: ['scorpio', 'pisces', 'taurus'],
  },
  {
    name: 'leo', symbol: '♌', element: 'Fire', dateRange: 'Jul 23 – Aug 22',
    startMonth: 7, startDay: 23, endMonth: 8, endDay: 22,
    traits: ['generous', 'charismatic', 'dramatic', 'proud', 'loyal'],
    ruling_planet: 'Sun', compatibility: ['aries', 'sagittarius', 'gemini'],
  },
  {
    name: 'virgo', symbol: '♍', element: 'Earth', dateRange: 'Aug 23 – Sep 22',
    startMonth: 8, startDay: 23, endMonth: 9, endDay: 22,
    traits: ['analytical', 'practical', 'diligent', 'critical', 'perfectionist'],
    ruling_planet: 'Mercury', compatibility: ['taurus', 'capricorn', 'cancer'],
  },
  {
    name: 'libra', symbol: '♎', element: 'Air', dateRange: 'Sep 23 – Oct 22',
    startMonth: 9, startDay: 23, endMonth: 10, endDay: 22,
    traits: ['diplomatic', 'fair', 'social', 'indecisive', 'charming'],
    ruling_planet: 'Venus', compatibility: ['gemini', 'aquarius', 'leo'],
  },
  {
    name: 'scorpio', symbol: '♏', element: 'Water', dateRange: 'Oct 23 – Nov 21',
    startMonth: 10, startDay: 23, endMonth: 11, endDay: 21,
    traits: ['passionate', 'intense', 'secretive', 'resourceful', 'determined'],
    ruling_planet: 'Pluto', compatibility: ['cancer', 'pisces', 'virgo'],
  },
  {
    name: 'sagittarius', symbol: '♐', element: 'Fire', dateRange: 'Nov 22 – Dec 21',
    startMonth: 11, startDay: 22, endMonth: 12, endDay: 21,
    traits: ['optimistic', 'adventurous', 'honest', 'restless', 'philosophical'],
    ruling_planet: 'Jupiter', compatibility: ['aries', 'leo', 'libra'],
  },
  {
    name: 'capricorn', symbol: '♑', element: 'Earth', dateRange: 'Dec 22 – Jan 19',
    startMonth: 12, startDay: 22, endMonth: 1, endDay: 19,
    traits: ['disciplined', 'responsible', 'ambitious', 'cautious', 'patient'],
    ruling_planet: 'Saturn', compatibility: ['taurus', 'virgo', 'scorpio'],
  },
  {
    name: 'aquarius', symbol: '♒', element: 'Air', dateRange: 'Jan 20 – Feb 18',
    startMonth: 1, startDay: 20, endMonth: 2, endDay: 18,
    traits: ['innovative', 'independent', 'humanitarian', 'eccentric', 'visionary'],
    ruling_planet: 'Uranus', compatibility: ['gemini', 'libra', 'sagittarius'],
  },
  {
    name: 'pisces', symbol: '♓', element: 'Water', dateRange: 'Feb 19 – Mar 20',
    startMonth: 2, startDay: 19, endMonth: 3, endDay: 20,
    traits: ['empathetic', 'artistic', 'intuitive', 'dreamy', 'compassionate'],
    ruling_planet: 'Neptune', compatibility: ['cancer', 'scorpio', 'capricorn'],
  },
];

// Nakshatra lookup (27 nakshatras)
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Moola', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

type Intent = 'love' | 'career' | 'health' | 'wealth' | 'marriage' | 'kundli' | 'daily' | 'weekly' | 'monthly' | 'general';

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  love:     ['love', 'romance', 'relationship', 'partner', 'crush', 'dating', 'boyfriend', 'girlfriend', 'heart'],
  career:   ['career', 'job', 'work', 'promotion', 'business', 'success', 'professional', 'office', 'salary'],
  health:   ['health', 'illness', 'sick', 'body', 'fitness', 'energy', 'disease', 'doctor', 'wellbeing'],
  wealth:   ['wealth', 'money', 'finance', 'income', 'investment', 'property', 'rich', 'savings', 'financial'],
  marriage: ['marriage', 'wedding', 'spouse', 'husband', 'wife', 'soulmate', 'married', 'engagement'],
  kundli:   ['kundli', 'kundali', 'birth chart', 'natal', 'horoscope chart', 'janam patrika'],
  daily:    ['today', 'daily', 'this day', 'right now'],
  weekly:   ['week', 'weekly', 'this week', 'next week'],
  monthly:  ['month', 'monthly', 'this month', 'next month'],
  general:  [],
};

const AI_RESPONSES: Record<Intent, string[]> = {
  love: [
    'The stars align favourably for matters of the heart. Venus blesses you with warmth and genuine connection — open yourself to vulnerability and love will follow.',
    'Jupiter casts a protective eye on your relationships. A misunderstanding may surface, but honest communication will resolve it swiftly and deepen your bond.',
    'Mercury\'s influence encourages heartfelt conversations. Share your true feelings with a loved one today — the timing is auspicious for emotional breakthroughs.',
    'The Moon heightens your emotional intuition. Trust your instincts about a romantic situation; your inner voice knows what your heart truly desires.',
  ],
  career: [
    'Saturn rewards discipline and perseverance this period. Stay focused on your long-term goals — a breakthrough opportunity is closer than it appears.',
    'Mars energises your professional ambitions. This is an excellent time to take initiative, pitch new ideas, or step into a leadership role with confidence.',
    'Mercury sharpens your communication skills. Use this window to negotiate, present, or collaborate — your ideas will be received with unusual clarity and enthusiasm.',
    'Jupiter expands your professional horizons. A connection from your network may open a door you did not anticipate; remain open to unexpected propositions.',
  ],
  health: [
    'The Sun infuses you with vitality, but caution against overexertion. Balance activity with adequate rest — your body is asking for gentle, consistent care.',
    'Mercury rules the nervous system, and its current position suggests you pay attention to stress levels. Meditation and breathing exercises will prove remarkably effective.',
    'Saturn encourages disciplined routines. Small, consistent health habits established now will yield significant benefits over the coming months.',
    'The Moon governs your emotional wellbeing. Nurture yourself through wholesome food, restful sleep, and time spent in nature to restore inner balance.',
  ],
  wealth: [
    'Jupiter, the planet of abundance, smiles upon your financial sector. Prudent investments made now carry long-term promise — avoid impulsive spending.',
    'Saturn counsels patience with finances. Avoid risky ventures; instead focus on consolidating existing resources and building a stable foundation.',
    'Venus brings opportunities for financial gain through creative endeavours or partnerships. A collaborative project may yield unexpected monetary rewards.',
    'Mercury favours careful planning and budgeting. Review your financial goals and make adjustments — clarity in numbers will reveal a promising path forward.',
  ],
  marriage: [
    'Venus and Jupiter together form a powerful combination for marital bliss. If you are seeking a life partner, this period holds auspicious possibilities.',
    'The seventh house is illuminated, drawing meaningful partnerships toward you. Approach a significant relationship with patience and an open heart.',
    'Saturn in your chart advises building a relationship on trust and shared values rather than passion alone — lasting unions are forged through commitment.',
    'A reunion or deepening of an existing bond is indicated. Marriage-related matters, including ceremonies and commitments, receive celestial blessings now.',
  ],
  kundli: [
    'Your birth chart reveals a unique celestial blueprint. The planetary positions at your birth time weave a story of strength, purpose, and soul mission.',
    'Your Kundli shows strong placements that support both material and spiritual growth. The ascendant gives you a powerful first impression and inner drive.',
    'The positioning of your Moon sign in your Kundli indicates deep emotional intelligence. Your instincts are your greatest guide in life\'s decisions.',
    'Your birth chart carries the blessings of Jupiter in a key house, suggesting wisdom, abundance, and spiritual progress as lifelong themes.',
  ],
  daily: [
    'Today carries positive vibrations for new beginnings. Start the morning with intention — even small actions taken with purpose create meaningful momentum.',
    'The planetary energy today supports clarity and decision-making. A matter that has been uncertain may suddenly become clear by the afternoon.',
    'Today is ideal for connecting with people who matter to you. Reach out, share, and listen — meaningful exchanges are highly favoured.',
    'Focus and discipline are your allies today. Tackle your most important task first and you will find the rest of the day flows with surprising ease.',
  ],
  weekly: [
    'This week begins with high energy and momentum. The early days favour action; save reflection and planning for the weekend when the pace slows.',
    'Midweek brings a turning point. A decision you have been delaying will feel more manageable — trust the clarity that arrives around Wednesday or Thursday.',
    'Relationships take centre stage this week. Nurture the connections that matter most; a conversation you have been avoiding is best had now.',
    'Creative inspiration peaks mid-week. Capture your ideas and act on them before the energy shifts toward the end of the week.',
  ],
  monthly: [
    'This month is a period of consolidation and growth. The seeds you plant in the first two weeks will bear fruit by month\'s end.',
    'A significant shift in one life area — career, relationships, or home — is indicated this month. Embrace change as a doorway to something better.',
    'The first half of the month rewards effort while the second half rewards patience. Balance action with stillness and you will end the month stronger.',
    'Financial matters clarify this month. A resolution to a lingering concern arrives, bringing relief and renewed confidence in your direction.',
  ],
  general: [
    'The universe is constantly conspiring in your favour. Trust the timing of your life and keep moving forward with faith and purpose.',
    'Your celestial path is unique and divinely guided. Embrace both the challenges and blessings — each shapes the magnificent story of your soul.',
    'The stars reflect your inner light back to you. What you seek, seeks you. Remain open, grateful, and grounded in your spiritual practice.',
    'Cosmic energy surrounds you with support and wisdom. Take a quiet moment to align with your higher self — the answers you need are already within.',
  ],
};

const SIGN_FLAVOUR: Record<string, string> = {
  aries:       'As an Aries, your innate courage amplifies this energy significantly.',
  taurus:      'Your Taurus steadiness means you will anchor this energy and make it tangible.',
  gemini:      'Your Gemini adaptability allows you to harness this influence across multiple areas at once.',
  cancer:      'Your Cancer intuition gives you a natural advantage in reading the subtle currents at play.',
  leo:         'As a Leo, your natural magnetism draws the best of this energy directly to you.',
  virgo:       'Your Virgo precision will help you apply this guidance in the most practical, effective way.',
  libra:       'Your Libra sense of balance ensures you navigate this period with grace and harmony.',
  scorpio:     'Your Scorpio depth and intensity mean this influence will feel especially transformative for you.',
  sagittarius: 'Your Sagittarius optimism and expansive spirit magnify the positive potential here.',
  capricorn:   'Your Capricorn discipline ensures you will convert this energy into lasting, concrete results.',
  aquarius:    'Your Aquarius originality means you will find a unique, inspired way to work with this energy.',
  pisces:      'Your Pisces sensitivity makes you especially attuned to the subtle cosmic currents at work.',
};

const LUCKY_NUMBERS: Record<string, number[]> = {
  aries: [1, 8, 17], taurus: [2, 6, 9], gemini: [3, 12, 14], cancer: [2, 7, 11],
  leo: [1, 4, 10], virgo: [3, 6, 7], libra: [6, 9, 13], scorpio: [8, 11, 18],
  sagittarius: [3, 7, 9], capricorn: [4, 8, 13], aquarius: [4, 7, 11], pisces: [3, 7, 12],
};

const LUCKY_COLORS: Record<string, string[]> = {
  aries: ['Red', 'Scarlet'], taurus: ['Green', 'Pink'], gemini: ['Yellow', 'Silver'],
  cancer: ['Silver', 'White'], leo: ['Gold', 'Orange'], virgo: ['Green', 'Brown'],
  libra: ['Blue', 'Lavender'], scorpio: ['Crimson', 'Black'], sagittarius: ['Purple', 'Blue'],
  capricorn: ['Brown', 'Grey'], aquarius: ['Turquoise', 'Violet'], pisces: ['Sea Green', 'Indigo'],
};

const DAILY_PREDICTIONS: string[] = [
  'Today is an excellent day for new beginnings. Your ruling planet energises your initiatives with powerful forward momentum.',
  'Relationships take priority. A heartfelt conversation will strengthen a bond that means a great deal to you.',
  'Financial clarity arrives. Review your goals and take one small decisive step toward your dreams.',
  'Creative energy flows abundantly. Express yourself boldly — your unique perspective holds genuine value.',
  'Challenges transform into opportunities. Your resilience and wisdom guide you through with grace.',
  'A period of rest and reflection brings profound insight. Listen to the whispers of your inner guidance.',
  'Your intuition is especially sharp today. Trust the quiet knowing that arises without seeking external validation.',
];

@Injectable()
export class AstrologyService {

  processAiMessage(dto: AiChatDto): { reply: string; timestamp: string } {
    const intent = this.detectIntent(dto.message);
    const sign = this.detectSign(dto.message, dto.sign, dto.context);
    const responses = AI_RESPONSES[intent];
    // Deterministic within the same minute so repeated calls are stable
    const seed = Math.floor(Date.now() / 60_000);
    const baseReply = responses[seed % responses.length];
    const flavour = sign ? `\n\n${SIGN_FLAVOUR[sign] ?? ''}` : '';
    return { reply: `${baseReply}${flavour}`.trim(), timestamp: new Date().toISOString() };
  }

  calculateKundli(dto: KundliDto) {
    const dob = new Date(dto.dateOfBirth);
    const [hour, minute] = dto.timeOfBirth.split(':').map(Number);
    const sunSign = this.getSunSign(dob);
    const moonSign = this.getMoonSign(dob);
    const ascendant = this.getAscendant(hour, minute);
    const nakshatra = this.getNakshatra(dob);
    const planetaryPositions = this.getPlanetaryPositions(dob);

    return {
      name: dto.name,
      dateOfBirth: dto.dateOfBirth,
      timeOfBirth: dto.timeOfBirth,
      placeOfBirth: dto.placeOfBirth,
      sunSign,
      moonSign,
      ascendant,
      nakshatra,
      planetaryPositions,
      generatedAt: new Date().toISOString(),
    };
  }

  getDailyHoroscope(sign: string) {
    const zodiac = ZODIAC_DATA.find((z) => z.name === sign.toLowerCase());
    if (!zodiac) return null;
    const today = new Date();
    const dateSeed =
      today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const signIndex = ZODIAC_DATA.findIndex((z) => z.name === sign.toLowerCase());
    const predictionIndex = (dateSeed + signIndex) % DAILY_PREDICTIONS.length;
    const luckyNums = LUCKY_NUMBERS[sign] ?? [1, 5, 9];
    const luckyColors = LUCKY_COLORS[sign] ?? ['White', 'Gold'];
    const luckyNum = luckyNums[(dateSeed + signIndex) % luckyNums.length];
    const luckyColor = luckyColors[(dateSeed + signIndex) % luckyColors.length];
    return {
      sign: zodiac.name,
      symbol: zodiac.symbol,
      element: zodiac.element,
      date: today.toISOString().split('T')[0],
      prediction: DAILY_PREDICTIONS[predictionIndex],
      luckyNumber: luckyNum,
      luckyColor,
      compatibility: zodiac.compatibility[0] ?? 'gemini',
    };
  }

  getAllSigns() {
    return ZODIAC_DATA.map((z) => ({
      name: z.name,
      symbol: z.symbol,
      element: z.element,
      dateRange: z.dateRange,
      traits: z.traits,
      ruling_planet: z.ruling_planet,
      compatibility: z.compatibility,
    }));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private detectIntent(message: string): Intent {
    const lower = message.toLowerCase();
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [Intent, string[]][]) {
      if (intent === 'general') continue;
      if (keywords.some((kw) => lower.includes(kw))) return intent;
    }
    return 'general';
  }

  private detectSign(message: string, signParam?: string, context?: string[]): string | null {
    if (signParam) {
      const s = signParam.toLowerCase();
      if (ZODIAC_DATA.some((z) => z.name === s)) return s;
    }
    const lower = message.toLowerCase();
    const fromMsg = ZODIAC_DATA.find((z) => lower.includes(z.name));
    if (fromMsg) return fromMsg.name;
    if (context?.length) {
      for (const ctx of context) {
        const ctxLower = ctx.toLowerCase();
        const fromCtx = ZODIAC_DATA.find((z) => ctxLower.includes(z.name));
        if (fromCtx) return fromCtx.name;
      }
    }
    return null;
  }

  private getSunSign(dob: Date): string {
    const month = dob.getMonth() + 1;
    const day = dob.getDate();
    for (const z of ZODIAC_DATA) {
      if (
        (month === z.startMonth && day >= z.startDay) ||
        (month === z.endMonth && day <= z.endDay)
      ) {
        return z.name;
      }
    }
    return 'capricorn';
  }

  private getMoonSign(dob: Date): string {
    // Approximate: Moon changes sign every ~2.5 days; use day-of-year offset
    const start = new Date(dob.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((dob.getTime() - start.getTime()) / 86_400_000);
    const index = Math.floor(dayOfYear / (365 / 12)) % 12;
    return ZODIAC_DATA[index].name;
  }

  private getAscendant(hour: number, minute: number): string {
    // Each sign rises for ~2 hours; approximate from birth time
    const index = Math.floor(((hour * 60 + minute) / (24 * 60)) * 12) % 12;
    return ZODIAC_DATA[index].name;
  }

  private getNakshatra(dob: Date): string {
    const year = dob.getFullYear();
    const epoch = new Date(year, 0, 14); // Makar Sankranti approx
    const daysSinceEpoch = Math.floor((dob.getTime() - epoch.getTime()) / 86_400_000);
    const index = ((daysSinceEpoch % 27) + 27) % 27;
    return NAKSHATRAS[index];
  }

  private getPlanetaryPositions(dob: Date): Record<string, string> {
    const seed =
      dob.getFullYear() * 10000 + (dob.getMonth() + 1) * 100 + dob.getDate();
    const positions: Record<string, string> = {};
    PLANETS.forEach((planet, i) => {
      const signIndex = (seed + i * 37) % 12;
      const house = ((seed + i * 13) % 12) + 1;
      positions[planet] = `${ZODIAC_DATA[signIndex].name} (House ${house})`;
    });
    return positions;
  }
}
