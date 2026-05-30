import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KundliService } from './astrology/kundli.service';
import { CompatibilityService } from './astrology/compatibility.service';
import { HoroscopeService } from './astrology/horoscope.service';
import { AiBirthProfile } from './entities/ai-birth-profile.entity';
import { GeminiTool } from './gemini-adapter.service';

// ── Tool definitions (sent to Gemini as function declarations) ─────────────
export const TOOL_DECLARATIONS: GeminiTool[] = [
  {
    name: 'get_kundli',
    description: 'Calculate and return the user\'s Vedic birth chart (kundli) including planetary positions, lagna, rashi, nakshatra, and Vimshottari dasha periods',
    parameters: {
      type: 'object',
      properties: {
        forPartner: { type: 'boolean', description: 'If true, get partner kundli instead of user' },
      },
    },
  },
  {
    name: 'get_horoscope',
    description: 'Get today\'s daily horoscope for a given rashi (zodiac sign)',
    parameters: {
      type: 'object',
      properties: {
        sign: { type: 'string', description: 'Zodiac sign name e.g. Aries, Taurus, Scorpio' },
        language: { type: 'string', description: 'Language code e.g. en, hi, ta' },
      },
    },
  },
  {
    name: 'get_compatibility',
    description: 'Calculate Guna Milan (8-koota compatibility) between two people using their nakshatra indices',
    parameters: {
      type: 'object',
      properties: {
        boyNakshatra: { type: 'string', description: 'Boy\'s nakshatra name' },
        girlNakshatra: { type: 'string', description: 'Girl\'s nakshatra name' },
      },
      required: ['boyNakshatra', 'girlNakshatra'],
    },
  },
  {
    name: 'get_panchang',
    description: 'Get today\'s Vedic panchang (tithi, nakshatra, yoga, karana, sunrise/sunset)',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
        city: { type: 'string', description: 'City name for location-specific panchang' },
      },
    },
  },
  {
    name: 'search_priests',
    description: 'Search for priests/pandits available for consultation near user or for a specific religion',
    parameters: {
      type: 'object',
      properties: {
        religion: { type: 'string', description: 'Religion filter: hindu, muslim, sikh, christian' },
        city: { type: 'string', description: 'City to search in' },
        serviceMode: { type: 'string', description: 'online, offline, or both' },
        limit: { type: 'number', description: 'Max results, default 3' },
      },
    },
  },
  {
    name: 'book_consultation',
    description: 'Book a consultation session with a priest. REQUIRES user_confirmed=true — always ask user for confirmation before calling',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Provider UUID' },
        serviceId:  { type: 'string', description: 'Service UUID' },
        scheduledAt: { type: 'string', description: 'ISO datetime for scheduled session' },
        user_confirmed: { type: 'boolean', description: 'Must be true — user explicitly confirmed the booking' },
      },
      required: ['providerId', 'serviceId', 'user_confirmed'],
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Get user\'s current ReligioGram wallet balance',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'top_up_wallet',
    description: 'Initiate a wallet top-up via Razorpay. REQUIRES user_confirmed=true',
    parameters: {
      type: 'object',
      properties: {
        amountRupees: { type: 'number', description: 'Amount to add in rupees' },
        user_confirmed: { type: 'boolean', description: 'Must be true — user explicitly confirmed' },
      },
      required: ['amountRupees', 'user_confirmed'],
    },
  },
  {
    name: 'search_temples',
    description: 'Search for nearby temples, mosques, churches, gurudwaras',
    parameters: {
      type: 'object',
      properties: {
        religion: { type: 'string' },
        city: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        radius: { type: 'number', description: 'Radius in km, default 10' },
      },
    },
  },
  {
    name: 'get_booking_history',
    description: 'Get user\'s past consultation and booking history',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records, default 5' },
      },
    },
  },
  {
    name: 'get_auspicious_dates',
    description: 'Get auspicious dates (muhurtas) for a ceremony type within a date range',
    parameters: {
      type: 'object',
      properties: {
        ceremonyType: { type: 'string', description: 'e.g. wedding, griha pravesh, namkaran, business' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['ceremonyType'],
    },
  },
  {
    name: 'get_rashifal',
    description: 'Get weekly or monthly rashifal (horoscope) for a zodiac sign',
    parameters: {
      type: 'object',
      properties: {
        sign: { type: 'string', description: 'Zodiac sign name' },
        period: { type: 'string', description: 'daily, weekly, or monthly' },
        language: { type: 'string', description: 'Language code' },
      },
      required: ['sign'],
    },
  },
  {
    name: 'ask_scripture',
    description: 'Look up a passage or teaching from religious scripture (Bhagavad Gita, Quran, Guru Granth Sahib, Bible) by topic or verse reference',
    parameters: {
      type: 'object',
      properties: {
        scripture: { type: 'string', description: 'bhagavad_gita, quran, guru_granth_sahib, bible' },
        topic: { type: 'string', description: 'Topic or concept to look up' },
        verseRef: { type: 'string', description: 'Specific verse reference if known' },
      },
    },
  },
  {
    name: 'get_priest_detail',
    description: 'Get detailed profile of a specific priest/provider by their ID, including services, pricing, reviews, and availability',
    parameters: {
      type: 'object',
      properties: {
        providerId: { type: 'string', description: 'Provider UUID' },
      },
      required: ['providerId'],
    },
  },
  {
    name: 'save_birth_profile',
    description: 'Save or update the user birth details for kundli generation. REQUIRES user_confirmed=true for DPDP consent',
    parameters: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Full name' },
        dob:         { type: 'string', description: 'Date of birth YYYY-MM-DD' },
        tob:         { type: 'string', description: 'Time of birth HH:MM' },
        placeLat:    { type: 'number', description: 'Birth place latitude' },
        placeLon:    { type: 'number', description: 'Birth place longitude' },
        placeLabel:  { type: 'string', description: 'Birth place name e.g. Mumbai, Maharashtra' },
        user_confirmed: { type: 'boolean', description: 'Must be true — user gave DPDP consent' },
      },
      required: ['name', 'dob', 'placeLat', 'placeLon', 'placeLabel', 'user_confirmed'],
    },
  },
  {
    name: 'report_issue',
    description: 'Open a support ticket on behalf of the user for a booking issue, payment problem, or general complaint',
    parameters: {
      type: 'object',
      properties: {
        category:    { type: 'string', description: 'booking, payment, technical, other' },
        description: { type: 'string', description: 'Issue description from the user' },
        bookingId:   { type: 'string', description: 'Related booking UUID if applicable' },
      },
      required: ['category', 'description'],
    },
  },
];

const NAKSHATRA_NAMES = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
  'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
  'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha',
  'Purva Bhadrapada','Uttara Bhadrapada','Revati',
];

const MONEY_TOOLS = new Set(['book_consultation', 'top_up_wallet']);
const DPDP_TOOLS  = new Set(['save_birth_profile']);

@Injectable()
export class FunctionCallingService {
  private readonly logger = new Logger(FunctionCallingService.name);

  constructor(
    private readonly kundli: KundliService,
    private readonly compat: CompatibilityService,
    private readonly horoscope: HoroscopeService,
    @InjectRepository(AiBirthProfile)
    private readonly profileRepo: Repository<AiBirthProfile>,
    private readonly config: ConfigService,
  ) {}

  getToolDeclarations(): GeminiTool[] {
    return TOOL_DECLARATIONS;
  }

  /** Returns true if this tool moves money and requires explicit user confirmation */
  requiresUserConfirmation(toolName: string): boolean {
    return MONEY_TOOLS.has(toolName);
  }

  async executeTool(toolName: string, args: Record<string, any>, userId: string): Promise<any> {
    // Safety gate: money-moving tools must have user_confirmed=true
    if (MONEY_TOOLS.has(toolName) && !args.user_confirmed) {
      return {
        error: 'user_confirmation_required',
        message: `This action requires your explicit confirmation. Please confirm you want to ${toolName === 'book_consultation' ? 'book this session' : 'add funds to your wallet'}.`,
      };
    }

    // DPDP gate: birth-profile tools require explicit consent
    if (DPDP_TOOLS.has(toolName) && !args.user_confirmed) {
      return {
        error: 'user_confirmation_required',
        message: 'Saving your birth details requires your explicit consent (DPDP). Please confirm to proceed.',
      };
    }

    try {
      switch (toolName) {
        case 'get_kundli':           return this.handleGetKundli(userId, args);
        case 'get_horoscope':        return this.handleGetHoroscope(args);
        case 'get_compatibility':    return this.handleGetCompatibility(args);
        case 'get_panchang':         return this.handleGetPanchang(args);
        case 'search_priests':       return this.handleSearchPriests(args);
        case 'book_consultation':    return this.handleBookConsultation(userId, args);
        case 'get_wallet_balance':   return this.handleGetWalletBalance(userId);
        case 'top_up_wallet':        return this.handleTopUpWallet(userId, args);
        case 'search_temples':       return this.handleSearchTemples(args);
        case 'get_booking_history':  return this.handleGetBookingHistory(userId, args);
        case 'get_auspicious_dates': return this.handleGetAuspiciousDates(args);
        case 'get_rashifal':         return this.handleGetRashifal(args);
        case 'ask_scripture':        return this.handleAskScripture(args);
        case 'get_priest_detail':   return this.handleGetPriestDetail(args);
        case 'save_birth_profile':  return this.handleSaveBirthProfile(userId, args);
        case 'report_issue':        return this.handleReportIssue(userId, args);
        default:
          return { error: 'unknown_tool', toolName };
      }
    } catch (err: any) {
      this.logger.warn(`Tool ${toolName} failed: ${err?.message}`);
      return { error: 'tool_error', message: err?.message ?? 'Unknown error' };
    }
  }

  private async handleGetKundli(userId: string, args: any) {
    const result = await this.kundli.getKundliForUser(userId);
    if (!result) {
      return { error: 'no_birth_profile', message: 'Please set up your birth profile first using the birth profile form.' };
    }
    return result.kundli;
  }

  private async handleGetHoroscope(args: any) {
    const sign   = args.sign ?? 'Aries';
    const lang   = args.language ?? 'en';
    const result = await this.horoscope.getDailyHoroscope(sign, lang);
    return { sign, language: lang, date: new Date().toISOString().slice(0, 10), ...result };
  }

  private handleGetCompatibility(args: any) {
    const boyIdx  = NAKSHATRA_NAMES.indexOf(args.boyNakshatra);
    const girlIdx = NAKSHATRA_NAMES.indexOf(args.girlNakshatra);
    if (boyIdx < 0 || girlIdx < 0) {
      return { error: 'invalid_nakshatra', message: `Could not find nakshatra: ${args.boyNakshatra} or ${args.girlNakshatra}` };
    }
    return this.compat.calculateGunaScore(boyIdx, girlIdx);
  }

  private handleGetPanchang(args: any) {
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    // Simplified panchang — full implementation requires swisseph tithi calc
    const tithis = ['Pratipada','Dvitiya','Tritiya','Chaturthi','Panchami','Shashthi',
                    'Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi',
                    'Trayodashi','Chaturdashi','Purnima/Amavasya'];
    const yogas  = ['Vishkambha','Priti','Ayushman','Saubhagya','Shobhana',
                    'Atiganda','Sukarma','Dhriti','Shula','Ganda','Vriddhi',
                    'Dhruva','Vyaghata','Harshana','Vajra','Siddhi','Vyatipata',
                    'Variyan','Parigha','Shiva','Siddha','Sadhya','Shubha',
                    'Shukla','Brahma','Indra','Vaidhriti'];
    const d = new Date(date);
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    return {
      date,
      city: args.city ?? 'Delhi',
      tithi: tithis[dayOfYear % 15],
      yoga: yogas[dayOfYear % 27],
      karana: dayOfYear % 2 === 0 ? 'Bava' : 'Balava',
      paksha: dayOfYear % 30 < 15 ? 'Shukla Paksha' : 'Krishna Paksha',
      note: 'Approximate values — use a Jyotish panchangam for precise timings',
    };
  }

  private handleSearchPriests(args: any) {
    // Returns a deep-link suggestion — actual search uses existing discovery API
    return {
      message: 'Opening priest search…',
      deepLink: `/explore?religion=${args.religion ?? this.config.get<string>('defaults.religion', 'all')}&city=${args.city ?? ''}&mode=${args.serviceMode ?? 'both'}`,
      action: 'navigate',
    };
  }

  private handleBookConsultation(userId: string, args: any) {
    // Deep-link to booking checkout — confirmed by user_confirmed gate above
    return {
      message: 'Redirecting to booking confirmation…',
      deepLink: `/booking/checkout?providerId=${args.providerId}&serviceId=${args.serviceId ?? ''}&scheduledAt=${args.scheduledAt ?? ''}`,
      action: 'navigate',
    };
  }

  private handleGetWalletBalance(userId: string) {
    // Returns a deep-link — actual balance from wallet service
    return {
      message: 'Opening your wallet…',
      deepLink: '/wallet',
      action: 'navigate',
    };
  }

  private handleTopUpWallet(userId: string, args: any) {
    return {
      message: `Initiating ₹${args.amountRupees} wallet top-up…`,
      deepLink: `/wallet?topup=${args.amountRupees}`,
      action: 'navigate',
    };
  }

  private handleSearchTemples(args: any) {
    return {
      message: 'Finding nearby sacred places…',
      deepLink: `/places?religion=${args.religion ?? this.config.get<string>('defaults.religion', 'all')}&city=${args.city ?? ''}`,
      action: 'navigate',
    };
  }

  private handleGetBookingHistory(userId: string, args: any) {
    return {
      message: 'Opening booking history…',
      deepLink: '/bookings',
      action: 'navigate',
    };
  }

  private handleGetAuspiciousDates(args: any) {
    const start = new Date(args.startDate ?? new Date().toISOString().slice(0, 10));
    const end   = new Date(args.endDate ?? new Date(start.getTime() + 90 * 86400000).toISOString().slice(0, 10));
    // Simplified: return first 3 Thursdays (auspicious by default) in range
    const dates: string[] = [];
    const d = new Date(start);
    while (d <= end && dates.length < 3) {
      if (d.getDay() === 4) { // Thursday = Brihaspativar
        dates.push(d.toISOString().slice(0, 10));
      }
      d.setDate(d.getDate() + 1);
    }
    return {
      ceremonyType: args.ceremonyType,
      auspiciousDates: dates,
      note: 'These are approximate. Consult a jyotishi for precise muhurta calculation.',
    };
  }

  private async handleGetRashifal(args: any) {
    const sign   = args.sign ?? 'Aries';
    const lang   = args.language ?? 'en';
    const result = await this.horoscope.getDailyHoroscope(sign, lang);
    return {
      sign,
      period: args.period ?? 'daily',
      language: lang,
      rashifal: result.horoscope,
      mood: result.mood,
      luckyColor: result.luckyColor,
      luckyNumber: result.luckyNumber,
    };
  }

  private handleAskScripture(args: any) {
    // Returns search suggestion — full RAG lookup happens in RagService
    return {
      message: `Searching ${args.scripture ?? 'scriptures'} for: ${args.topic ?? args.verseRef ?? ''}`,
      scripture: args.scripture ?? 'bhagavad_gita',
      topic: args.topic,
      verseRef: args.verseRef,
      action: 'rag_lookup',
    };
  }
  private handleGetPriestDetail(args: any) {
    return {
      message: 'Opening provider profile...',
      deepLink: `/providers/${args.providerId}`,
      action: 'navigate',
    };
  }

  private handleSaveBirthProfile(userId: string, args: any) {
    // Deep-link to birth profile form pre-filled — actual save happens via POST /ai/birth-profile
    return {
      message: 'Opening birth profile form...',
      deepLink: `/ai/birth-profile?name=${encodeURIComponent(args.name ?? '')}&dob=${args.dob ?? ''}&tob=${args.tob ?? ''}&lat=${args.placeLat ?? ''}&lon=${args.placeLon ?? ''}&place=${encodeURIComponent(args.placeLabel ?? '')}`,
      action: 'navigate',
    };
  }

  private handleReportIssue(userId: string, args: any) {
    const params = new URLSearchParams({
      category: args.category ?? 'other',
      description: args.description ?? '',
      ...(args.bookingId ? { bookingId: args.bookingId } : {}),
    });
    return {
      message: 'Opening support ticket form...',
      deepLink: `/support/new?${params.toString()}`,
      action: 'navigate',
    };
  }

}