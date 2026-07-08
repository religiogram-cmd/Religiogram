import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SwissEphemerisService } from './swisseph.service';
import { AiBirthProfile } from '../entities/ai-birth-profile.entity';

const PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn'];

const DASHA_ORDER = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
const DASHA_YEARS: Record<string, number> = {
  Ketu:7, Venus:20, Sun:6, Moon:10, Mars:7, Rahu:18, Jupiter:16, Saturn:19, Mercury:17,
};

@Injectable()
export class KundliService {
  private readonly logger = new Logger(KundliService.name);

  constructor(
    private readonly swe: SwissEphemerisService,
    @InjectRepository(AiBirthProfile)
    private readonly profileRepo: Repository<AiBirthProfile>,
  ) {}

  async calculateKundli(profile: AiBirthProfile) {
    const [year, month, day] = profile.birthDate.split('-').map(Number);
    let hour = 0, min = 0;
    if (profile.birthTime) {
      [hour, min] = profile.birthTime.split(':').map(Number);
    }

    const jd = this.swe.dateToJulianDay(year, month, day, hour, min);

    const planets = PLANETS.map(p => this.swe.getPlanetPosition(jd, p)).filter(Boolean);
    const moonPos = planets.find(p => p?.planet === 'Moon');
    const lagna   = (profile.birthLat && profile.birthLng)
      ? this.swe.getAscendant(jd, profile.birthLat, profile.birthLng)
      : null;

    const rashi     = moonPos ? this.swe.getRashiFromMoon(moonPos.longitude) : 'Unknown';
    const nakshatra = moonPos ? this.swe.getNakshatraFromMoon(moonPos.longitude) : 'Unknown';
    const dashas    = moonPos ? this.computeDasha(moonPos.longitude, new Date(profile.birthDate)) : [];

    const kundli = { planets, lagna, rashi, nakshatra, dashas };

    /* Cache computed kundli back into the profile row.
     * NB: TypeORM's Repository.update(scalar, partial) treats the scalar as
     * the value of the PRIMARY key column (`id` here), NOT `user_id`. Passing
     * `profile.userId` as a scalar matched zero rows and silently discarded
     * every computed rashi/nakshatra/lagna — the astrologer's context brief
     * kept saying "User has not provided birth details" for the chart lines,
     * and the Kundli tab kept re-computing on every open because the cache
     * check `if (profile.kundliJson) return` never succeeded.
     * Passing an object criterion targets the correct WHERE user_id = ...
     * clause. */
    await this.profileRepo.update(
      { userId: profile.userId },
      { rashi, nakshatra, lagna: lagna?.lagna, kundliJson: kundli as any },
    );

    return kundli;
  }

  private computeDasha(moonLong: number, birthDate: Date) {
    // Nakshatra determines starting dasha
    const nakshatraIndex = Math.floor(moonLong / (360 / 27)) % 27;
    const lordIndex = nakshatraIndex % 9;
    const firstLord = DASHA_ORDER[lordIndex];
    const nakshatraPad = moonLong % (360 / 27);
    const nakshatraSize = 360 / 27;
    const elapsedFraction = nakshatraPad / nakshatraSize;
    const firstDashaYearsRemaining = DASHA_YEARS[firstLord] * (1 - elapsedFraction);

    const dashas: Array<{ lord: string; startDate: string; endDate: string; years: number }> = [];
    let current = new Date(birthDate);

    const addYears = (d: Date, y: number) => {
      const nd = new Date(d);
      nd.setFullYear(nd.getFullYear() + Math.floor(y));
      nd.setDate(nd.getDate() + Math.round((y % 1) * 365));
      return nd;
    };

    for (let i = 0; i < 9; i++) {
      const lordIdx = (lordIndex + i) % 9;
      const lord = DASHA_ORDER[lordIdx];
      const years = i === 0 ? firstDashaYearsRemaining : DASHA_YEARS[lord];
      const end = addYears(current, years);
      dashas.push({
        lord,
        startDate: current.toISOString().slice(0, 10),
        endDate:   end.toISOString().slice(0, 10),
        years: Math.round(years * 10) / 10,
      });
      current = end;
    }

    return dashas;
  }

  async getKundliForUser(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return null;
    if (profile.kundliJson) return { profile, kundli: profile.kundliJson };
    const kundli = await this.calculateKundli(profile);
    return { profile, kundli };
  }
}
