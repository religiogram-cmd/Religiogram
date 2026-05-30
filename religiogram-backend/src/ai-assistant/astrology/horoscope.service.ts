import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { GeminiAdapterService } from '../gemini-adapter.service';

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
];

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil'   }, { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' }, { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' }, { code: 'gu', name: 'Gujarati' },
  { code: 'pa', name: 'Punjabi' }, { code: 'bn', name: 'Bengali' },
  { code: 'ur', name: 'Urdu'    }, { code: 'or', name: 'Odia'    },
];

const LUCKY_COLORS = [
  'Red','Orange','Yellow','Green','Blue','Indigo','Violet',
  'White','Gold','Silver','Pink','Maroon','Teal','Coral','Saffron',
];

// Section 13 — response shape for GET /v1/ai/horoscope/today/:sign
export interface HoroscopeResult {
  horoscope: string;
  mood: string;
  luckyColor: string;
  luckyNumber: number;
}

@Injectable()
export class HoroscopeService {
  private readonly logger = new Logger(HoroscopeService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly gemini: GeminiAdapterService,
    private readonly config: ConfigService,
  ) {}

  private cacheKey(sign: string, lang: string, date: string) {
    return `rg-ai:horoscope:${date}:${sign.toLowerCase()}:${lang}`;
  }

  async getDailyHoroscope(sign: string, language = 'en'): Promise<HoroscopeResult> {
    const date   = new Date().toISOString().slice(0, 10);
    const key    = this.cacheKey(sign, language, date);
    const client = this.redis.getClient();

    const cached = await client.get(key);
    if (cached) {
      try { return JSON.parse(cached) as HoroscopeResult; } catch { /* fallthrough */ }
    }

    const result = await this.generateHoroscope(sign, language, date);
    await client.set(key, JSON.stringify(result), 'EX', 86_400);
    return result;
  }

  /** Convenience method for internal use when only the text is needed */
  async getDailyHoroscopeText(sign: string, language = 'en'): Promise<string> {
    return (await this.getDailyHoroscope(sign, language)).horoscope;
  }

  private async generateHoroscope(sign: string, language: string, date: string): Promise<HoroscopeResult> {
    const langName = LANGUAGES.find(l => l.code === language)?.name ?? 'English';

    const prompt = `You are Jyotish AI, a Vedic astrology expert. Today is ${date}.
Write a daily horoscope for ${sign} rashi in ${langName}.

Respond with a valid JSON object ONLY — no markdown, no explanation. Format:
{
  "horoscope": "3-4 sentence horoscope covering general energy, relationships, and finances. Warm and spiritual tone.",
  "mood": "one word mood (e.g. Energetic, Reflective, Joyful, Calm, Bold, Grateful)",
  "luckyColor": "one color name",
  "luckyNumber": <integer 1-9>
}`;

    try {
      const raw = await this.gemini.complete({ prompt, maxTokens: 300 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          horoscope:   String(parsed.horoscope ?? ''),
          mood:        String(parsed.mood ?? 'Reflective'),
          luckyColor:  String(parsed.luckyColor ?? LUCKY_COLORS[0]),
          luckyNumber: Number(parsed.luckyNumber ?? 7) || 7,
        };
      }
    } catch (e: any) {
      this.logger.warn(`Horoscope generation failed for ${sign}/${language}: ${e?.message}`);
    }

    // Fallback
    return {
      horoscope:   `Today is a day of reflection and spiritual growth for ${sign}. Trust your inner wisdom and move forward with intention.`,
      mood:        'Reflective',
      // Deterministic daily selection: same sign gets same color all day
      luckyColor:  LUCKY_COLORS[(new Date().getDate() + SIGNS.indexOf(sign)) % LUCKY_COLORS.length],
      luckyNumber: (new Date().getDate() % 9) + 1,
    };
  }

  /** Cron: 5 AM IST = 23:30 UTC previous day — generate all 12 signs x 12 languages */
  @Cron('30 23 * * *', { timeZone: 'UTC' })
  async generateAllHoroscopes() {
    this.logger.log('Generating daily horoscopes for all signs x languages');
    const date = new Date();
    date.setUTCHours(date.getUTCHours() + 5);
    date.setUTCMinutes(date.getUTCMinutes() + 30);
    const dateStr = date.toISOString().slice(0, 10);

    let generated = 0;
    for (const sign of SIGNS) {
      for (const lang of LANGUAGES) {
        try {
          const result = await this.generateHoroscope(sign, lang.code, dateStr);
          const key    = this.cacheKey(sign, lang.code, dateStr);
          const client = this.redis.getClient();
          await client.set(key, JSON.stringify(result), 'EX', 90_000); // 25h TTL
          generated++;
        } catch (e: any) {
          this.logger.warn(`Failed ${sign}/${lang.code}: ${e?.message}`);
        }
        // Throttle to avoid Gemini rate limits
        await new Promise(r => setTimeout(r, 200));
      }
    }
    this.logger.log(`Generated ${generated}/144 horoscopes`);
  }
}
