import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface PlanetPosition {
  planet: string;
  longitude: number;
  sign: number;       // 0=Aries .. 11=Pisces
  signName: string;
  degree: number;     // degree within sign
  nakshatra: string;
  retrograde: boolean;
}

export interface JulianDay {
  jd: number;
  ut: number;
}

const SIGN_NAMES = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
];

const NAKSHATRA_NAMES = [
  'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
  'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
  'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
  'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha',
  'Purva Bhadrapada','Uttara Bhadrapada','Revati',
];

const PLANET_IDS: Record<string, number> = {
  Sun: 0, Moon: 1, Mercury: 2, Venus: 3, Mars: 4,
  Jupiter: 5, Saturn: 6, Uranus: 7, Neptune: 8, Pluto: 9,
  // Rahu=11 (mean node), Ketu derived
};

@Injectable()
export class SwissEphemerisService implements OnModuleInit {
  private readonly logger = new Logger(SwissEphemerisService.name);
  private swe: any;

  async onModuleInit() {
    try {
      // Dynamic require — swisseph-v2 is a native addon
      this.swe = require('swisseph-v2');
      // Use Lahiri ayanamsha (sidereal, Vedic)
      this.swe.set_sid_mode(this.swe.SE_SIDM_LAHIRI, 0, 0);
      this.logger.log('Swiss Ephemeris initialised (Lahiri ayanamsha)');
    } catch (e: any) {
      this.logger.warn(`swisseph-v2 not available: ${e?.message}. Astrology will use fallback.`);
      this.swe = null;
    }
  }

  dateToJulianDay(year: number, month: number, day: number, hour = 0, min = 0): number {
    if (!this.swe) return this.julianDayFallback(year, month, day, hour, min);
    return this.swe.julday(year, month, day, hour + min / 60, this.swe.SE_GREG_CAL);
  }

  getPlanetPosition(jd: number, planetName: string): PlanetPosition | null {
    if (!this.swe) return this.fallbackPlanet(jd, planetName);

    const planetId = PLANET_IDS[planetName];
    if (planetId === undefined) return null;

    const flags = this.swe.SEFLG_SWIEPH | this.swe.SEFLG_SIDEREAL;
    const result = this.swe.calc_ut(jd, planetId, flags);
    if (result.rflag < 0) return null;

    const longitude  = result.longitude % 360;
    const signIndex  = Math.floor(longitude / 30);
    const degree     = longitude % 30;
    const nakshatraI = Math.floor(longitude / (360 / 27));
    const retrograde = result.longitudeSpeed < 0;

    return {
      planet: planetName,
      longitude,
      sign: signIndex,
      signName: SIGN_NAMES[signIndex],
      degree,
      nakshatra: NAKSHATRA_NAMES[nakshatraI] ?? 'Unknown',
      retrograde,
    };
  }

  getAscendant(jd: number, lat: number, lng: number): { lagna: string; degree: number } | null {
    if (!this.swe) return { lagna: 'Aries', degree: 0 };

    const houses = this.swe.houses(jd, lat, lng, 'P'); // Placidus
    if (!houses?.ascendant) return null;

    // Apply ayanamsha for Vedic lagna
    const ayanamsha = this.swe.get_ayanamsa_ut(jd);
    const lagnaLong = ((houses.ascendant - ayanamsha) % 360 + 360) % 360;
    const signIndex = Math.floor(lagnaLong / 30);

    return { lagna: SIGN_NAMES[signIndex], degree: lagnaLong % 30 };
  }

  getNakshatraFromMoon(moonLongitude: number): string {
    const i = Math.floor(moonLongitude / (360 / 27)) % 27;
    return NAKSHATRA_NAMES[i];
  }

  getRashiFromMoon(moonLongitude: number): string {
    return SIGN_NAMES[Math.floor(moonLongitude / 30) % 12];
  }

  isAvailable(): boolean { return !!this.swe; }

  // ── Fallbacks (for environments without native swisseph) ─────────────────

  private julianDayFallback(y: number, m: number, d: number, h: number, min: number): number {
    // Simplified Julian Day calculation
    const a = Math.floor((14 - m) / 12);
    const yr = y + 4800 - a;
    const mo = m + 12 * a - 3;
    return d + Math.floor((153 * mo + 2) / 5) + 365 * yr +
           Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) -
           32045 + (h + min / 60) / 24;
  }

  private fallbackPlanet(jd: number, planetName: string): PlanetPosition {
    // Deterministic fake positions for fallback mode
    const seed = (jd + planetName.charCodeAt(0)) % 360;
    const signIndex = Math.floor(seed / 30) % 12;
    const nI = Math.floor(seed / (360 / 27)) % 27;
    return {
      planet: planetName,
      longitude: seed,
      sign: signIndex,
      signName: SIGN_NAMES[signIndex],
      degree: seed % 30,
      nakshatra: NAKSHATRA_NAMES[nI],
      retrograde: false,
    };
  }
}
