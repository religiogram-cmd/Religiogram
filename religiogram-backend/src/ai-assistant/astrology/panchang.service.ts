import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../../redis/redis.service';
import { SwissEphemerisService } from './swisseph.service';

export interface PanchangData {
  date: string;
  city: string;
  tithi: string;
  tithiEnd?: string;
  nakshatra: string;
  nakshatraEnd?: string;
  yoga: string;
  karana: string;
  paksha: string;
  sunrise: string;
  sunset: string;
  moonSign: string;
  sunSign: string;
  rahukaal: string;
  gulikakaal: string;
  abhijitMuhurta: string;
  inauspicious: string[];
  auspicious: string[];
}

const TITHIS = [
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi',
  'Trayodashi', 'Chaturdashi', 'Purnima',
  'Pratipada', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi',
  'Trayodashi', 'Chaturdashi', 'Amavasya',
];

const YOGAS = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda',
  'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata',
  'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

const KARANAS = [
  'Bava', 'Balava', 'Kaulava', 'Taitila', 'Garija', 'Vanija', 'Vishti',
  'Shakuni', 'Chatushpada', 'Naga', 'Kimstughna',
];

const NAKSHATRA_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Rahu kaal by day of week (slot index 0-7 of day, each ~1.5h)
const RAHUKAAL_SLOT: Record<number, number> = {
  0: 7, // Sunday: 4:30-6:00 PM (slot 7)
  1: 1, // Monday: 7:30-9:00 AM
  2: 6, // Tuesday: 3:00-4:30 PM
  3: 5, // Wednesday: 12:00-1:30 PM
  4: 2, // Thursday: 1:30-3:00 PM
  5: 3, // Friday: 10:30-12:00 PM
  6: 4, // Saturday: 9:00-10:30 AM
};

@Injectable()
export class PanchangService {
  private readonly logger = new Logger(PanchangService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly swe: SwissEphemerisService,
  ) {}

  private cacheKey(date: string, city: string) {
    return `rg-ai:panchang:${date}:${city.toLowerCase().replace(/\s+/g, '-')}`;
  }

  async getTodayPanchang(city = 'Delhi'): Promise<PanchangData> {
    const date   = new Date().toISOString().slice(0, 10);
    const key    = this.cacheKey(date, city);
    const client = this.redis.getClient();

    const cached = await client.get(key);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const panchang = this.computePanchang(date, city);

    // Cache until midnight IST (~86400s)
    await client.set(key, JSON.stringify(panchang), 'EX', 86_400);
    return panchang;
  }

  private computePanchang(date: string, city: string): PanchangData {
    const [year, month, day] = date.split('-').map(Number);

    // Julian Day for noon
    const jd     = this.swe.dateToJulianDay(year, month, day, 5, 30); // 5:30 AM IST = midnight UTC
    const moonPos = this.swe.getPlanetPosition(jd, 'Moon');
    const sunPos  = this.swe.getPlanetPosition(jd, 'Sun');

    // Tithi: based on Moon–Sun elongation (each tithi = 12 degrees)
    const moonLong = moonPos?.longitude ?? 0;
    const sunLong  = sunPos?.longitude  ?? 0;
    const elongation = ((moonLong - sunLong) % 360 + 360) % 360;
    const tithiIndex = Math.floor(elongation / 12) % 30;

    // Paksha
    const paksha = tithiIndex < 15 ? 'Shukla Paksha' : 'Krishna Paksha';

    // Nakshatra from Moon
    const nakshatraIdx = Math.floor(moonLong / (360 / 27)) % 27;

    // Yoga: (Moon longitude + Sun longitude) / (360/27)
    const yogaLong = (moonLong + sunLong) % 360;
    const yogaIdx  = Math.floor(yogaLong / (360 / 27)) % 27;

    // Karana: half-tithi
    const karanaIdx = Math.floor(elongation / 6) % 11;

    // Moon sign and Sun sign
    const moonSignIdx = Math.floor(moonLong / 30) % 12;
    const sunSignIdx  = Math.floor(sunLong  / 30) % 12;

    // Sunrise / sunset (approximate for India)
    const d       = new Date(date);
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    const sunriseH  = 6 + Math.sin((dayOfYear - 81) * Math.PI / 180) * 0.5;
    const sunsetH   = 18 - Math.sin((dayOfYear - 81) * Math.PI / 180) * 0.5;
    const toTime = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')} IST`;
    };

    // Rahu kaal
    const dow       = d.getDay();
    const slotIdx   = RAHUKAAL_SLOT[dow] ?? 7;
    const dayLen    = sunsetH - sunriseH;
    const slotLen   = dayLen / 8;
    const rahStart  = sunriseH + slotLen * (slotIdx - 1);
    const rahEnd    = rahStart + slotLen;

    // Gulikakaal: Saturday's Rahu = index 4 is Gulikakaal for Sun
    const gulikaSlot = { 0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 7 }[dow] ?? 6;
    const guliStart  = sunriseH + slotLen * (gulikaSlot - 1);
    const guliEnd    = guliStart + slotLen;

    // Abhijit Muhurta: ~midday ±24 min
    const noon     = (sunriseH + sunsetH) / 2;
    const abhStart = noon - 0.4;
    const abhEnd   = noon + 0.4;

    // Auspicious / inauspicious based on tithi + day
    const inauspicious: string[] = [];
    const auspicious: string[]   = [];
    if ([3, 7, 11, 15, 19, 23].includes(tithiIndex)) auspicious.push('Good for new beginnings');
    if ([4, 9, 14, 29].includes(tithiIndex))          inauspicious.push('Avoid major decisions');
    if (dow === 2 || dow === 6)                         inauspicious.push('Rahu day — avoid travel start');

    return {
      date,
      city,
      tithi:            `${TITHIS[tithiIndex]} (${paksha})`,
      nakshatra:        NAKSHATRA_NAMES[nakshatraIdx] ?? 'Ashwini',
      yoga:             YOGAS[yogaIdx] ?? 'Vishkambha',
      karana:           KARANAS[karanaIdx] ?? 'Bava',
      paksha,
      sunrise:          toTime(sunriseH),
      sunset:           toTime(sunsetH),
      moonSign:         SIGN_NAMES[moonSignIdx] ?? 'Aries',
      sunSign:          SIGN_NAMES[sunSignIdx]  ?? 'Aries',
      rahukaal:         `${toTime(rahStart)} – ${toTime(rahEnd)}`,
      gulikakaal:       `${toTime(guliStart)} – ${toTime(guliEnd)}`,
      abhijitMuhurta:   `${toTime(abhStart)} – ${toTime(abhEnd)}`,
      inauspicious,
      auspicious,
    };
  }

  /** Pre-generate panchang at midnight IST for major cities */
  @Cron('30 18 * * *', { timeZone: 'UTC' }) // midnight IST
  async preGenerate() {
    const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'];
    for (const city of cities) {
      await this.getTodayPanchang(city);
    }
    this.logger.log(`Panchang pre-generated for ${cities.length} cities`);
  }
}
