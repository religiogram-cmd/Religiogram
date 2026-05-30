import {
  Controller, Get, Param, Query, Res,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Response } from 'express';
import { ProviderEntity } from './entities/provider.entity';
import { ProviderServiceEntity } from './entities/provider-service.entity';
import { CatalogService } from '../catalog/entities/catalog-service.entity';
import { ServiceCategory } from '../catalog/entities/service-category.entity';
import { Public } from '../auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { AvailabilityEntity } from './entities/availability.entity';

@Controller({ path: 'providers', version: '1' })
export class DiscoveryController {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(CatalogService)
    private readonly catalog: Repository<CatalogService>,
    @InjectRepository(ServiceCategory)
    private readonly categories: Repository<ServiceCategory>,
    @InjectRepository(AvailabilityEntity)
    private readonly availability: Repository<AvailabilityEntity>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  /**
   * GET /v1/providers/by-religion/:religion
   * Returns paginated approved providers filtered by religion.
   * Cloudflare cache: s-maxage=60
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get('by-religion/:religion')
  async byReligion(
    @Param('religion') religion: string,
    @Query('city') city?: string,
    @Query('lang') lang?: string,
    @Query('availableNow') availableNow?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    const qb = this.providers
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.services', 'svc', 'svc.is_active = true')
      .where('p.provider_state = :state', { state: 'approved' })
      .andWhere('LOWER(p.religion) = :religion', { religion: religion.toLowerCase() });

    if (city) qb.andWhere('LOWER(p.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    if (lang) qb.andWhere(':lang = ANY(p.languages)', { lang: lang.toLowerCase() });

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere('(p.created_at < :afterDate OR (p.created_at = :afterDate AND p.id < :afterId))', { afterDate: d, afterId: i });
      } catch { /* invalid cursor */ }
    }
    const items = await qb
      .orderBy('p.rating_avg', 'DESC', 'NULLS LAST')
      .addOrderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(limitNum + 1)
      .getMany();
    const hasMore = items.length > limitNum;
    if (hasMore) items.pop();
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ d: last.createdAt?.toISOString() ?? '', i: last.id })).toString('base64url')
      : null;

    return {
      items: items.map(p => ({
        id: p.id,
        fullName: p.fullName,
        religion: p.religion,
        city: p.city,
        experienceYears: p.experienceYears,
        languages: p.languages,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        bio: p.bio,
        perMinutePaise: p.perMinutePaise,
        perMinuteTier: p.perMinuteTier,
        serviceMode: p.serviceMode,
        servicesCount: p.services?.length ?? 0,
      })),
      limit: limitNum, hasMore, nextCursor,
    };
  }

  /**
   * GET /v1/catalog/:religion
   * Returns grouped service list with RG suggested prices.
   * Cloudflare cache: s-maxage=300
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get('/catalog/:religion')
  async catalogByReligion(
    @Param('religion') religion: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    const cats = await this.categories
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.services', 'svc', 'svc.is_active = true')
      .where('LOWER(c.religion_slug) = :religion', { religion: religion.toLowerCase() })
      .orderBy('c.sort_order', 'ASC')
      .addOrderBy('svc.name', 'ASC')
      .getMany();

    return {
      religion,
      categories: cats.map(cat => ({
        name: cat.name,
        icon: cat.icon,
        services: (cat.services ?? []).map(svc => ({
          id: svc.id,
          slug: svc.slug,
          name: svc.name,
          serviceType: svc.serviceType,
          defaultDurationMin: svc.defaultDurationMin,
          rgPricePaise: svc.rgPricePaise ?? null,
          marketMinPaise: svc.marketMinPaise ?? null,
          marketMaxPaise: svc.marketMaxPaise ?? null,
          sensitive: svc.sensitive ?? false,
          commissionPct: svc.platformCommissionPct,
        })),
      })),
    };
  }

  /**
   * GET /v1/providers/by-service/:serviceId
   * Returns paginated approved providers who offer a specific catalog service.
   * §8.2 spec endpoint.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get('by-service/:serviceId')
  async byService(
    @Param('serviceId') serviceId: string,
    @Query('city') city?: string,
    @Query('lang') lang?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    const qb = this.providers
      .createQueryBuilder('p')
      .innerJoin('p.services', 'ps', 'ps.is_active = true')
      .innerJoin('ps.catalogService', 'cs', 'cs.id = :serviceId', { serviceId })
      .where('p.provider_state = :state', { state: 'approved' })
      .select(['p', 'ps', 'cs']);

    if (city) qb.andWhere('LOWER(p.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    if (lang) qb.andWhere(':lang = ANY(p.languages)', { lang });
    if (priceMin) qb.andWhere('ps.price_paise >= :priceMin', { priceMin: parseInt(priceMin) * 100 });
    if (priceMax) qb.andWhere('ps.price_paise <= :priceMax', { priceMax: parseInt(priceMax) * 100 });

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere('(p.created_at < :afterDate OR (p.created_at = :afterDate AND p.id < :afterId))', { afterDate: d, afterId: i });
      } catch { /* invalid cursor */ }
    }
    const items = await qb
      .orderBy('p.rating_avg', 'DESC', 'NULLS LAST')
      .addOrderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(limitNum + 1)
      .getMany();
    const hasMore = items.length > limitNum;
    if (hasMore) items.pop();
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ d: last.createdAt?.toISOString() ?? '', i: last.id })).toString('base64url')
      : null;

    return {
      items: items.map(p => ({
        id: p.id,
        fullName: p.fullName,
        religion: p.religion,
        city: p.city,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        perMinutePaise: p.perMinutePaise,
        serviceMode: p.serviceMode,
        isOnline: (p as unknown as Record<string, boolean>).isOnline ?? false,
      })),
      limit: limitNum, hasMore, nextCursor,
    };
  }

  /**
   * GET /v1/providers/:id/slots?date=YYYY-MM-DD&durationMinutes=60
   * Returns available time slots for a provider on a given date.
   * §8.2 spec endpoint.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get(':id/slots')
  async getSlots(
    @Param('id') providerId: string,
    @Query('date') date?: string,
    @Query('durationMinutes') durationMinutes = '60',
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');

    const provider = await this.providers.findOne({
      where: { id: providerId, providerState: 'approved' },
    });
    if (!provider) throw new NotFoundException('Provider not found or not approved');

    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek  = targetDate.getDay(); // 0=Sun…6=Sat

    const slots = await this.availability
      .createQueryBuilder('a')
      .where('a.provider_id = :providerId', { providerId })
      .andWhere('a.day_of_week = :day', { day: dayOfWeek })
      .andWhere('a.is_break = false')
      .orderBy('a.start_time', 'ASC')
      .getMany();

    const durMin = parseInt(durationMinutes, 10);

    // Split each availability window into slots of `durationMinutes`
    const result: { start: string; end: string; available: boolean }[] = [];
    for (const slot of slots) {
      const [startH, startM] = (slot.startTime as string).split(':').map(Number);
      const [endH, endM]     = (slot.endTime   as string).split(':').map(Number);
      let cursor = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      while (cursor + durMin <= endMinutes) {
        const sh = Math.floor(cursor / 60).toString().padStart(2, '0');
        const sm = (cursor % 60).toString().padStart(2, '0');
        const eh = Math.floor((cursor + durMin) / 60).toString().padStart(2, '0');
        const em = ((cursor + durMin) % 60).toString().padStart(2, '0');
        result.push({
          start: `${sh}:${sm}`,
          end:   `${eh}:${em}`,
          available: true, // resolved below after confirmed-booking query
        });
        cursor += durMin;
      }
    }

    // ── Subtract confirmed/in-progress bookings for the target date ──────────
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const confirmedBookings = await this.bookingRepo.find({
      where: {
        providerId,
        scheduledAt: Between(dayStart, dayEnd),
        status: In([
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.PENDING,
        ]),
      },
      select: ['scheduledAt', 'durationMinutes'],
    });
    // Mark slots that overlap any confirmed booking as unavailable
    for (const slot of result) {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const slotStartMin = sh * 60 + sm;
      const slotEndMin   = eh * 60 + em;
      for (const b of confirmedBookings) {
        const bStart = new Date(b.scheduledAt);
        const bStartMin = bStart.getUTCHours() * 60 + bStart.getUTCMinutes();
        const bEndMin   = bStartMin + (b.durationMinutes ?? durMin);
        // Overlap: slot starts before booking ends AND slot ends after booking starts
        if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
          slot.available = false;
          break;
        }
      }
    }

    // §9.6 Trust signals
    const availableCount = result.filter(s => s.available).length;
    // Festive alert: check if today has a holiday_surge entry
    let festiveAlert = false;
    try {
      const today = targetDate.toISOString().slice(0, 10);
      const surge = await this.providers.manager.query(
        `SELECT 1 FROM holiday_surge WHERE surge_date = $1 LIMIT 1`,
        [today],
      ).catch(() => []);
      festiveAlert = Array.isArray(surge) && surge.length > 0;
    } catch { /* table may not exist yet in older migrations */ }

    return {
      providerId,
      date: targetDate.toISOString().slice(0, 10),
      durationMinutes: durMin,
      slots: result,
      availableSlotsToday: availableCount,
      /** §9.6: "Only X slots left" signal — true when ≤ 3 slots remain */
      slotsLow: availableCount > 0 && availableCount <= 3,
      /** §9.6: "Festive slots filling fast" — derived from holiday_surge table */
      festiveAlert,
    };
  }

  /**
   * POST /v1/provider/onboarding/validate-rate
   * Server-side guard: validates the per-minute rate stays within
   * the experience-band cap (§4.2).
   *   0-4yr: INR 10-20/min  (tier=new)
   *   4-10yr: INR 10-50/min  (tier=verified)
   *   10+yr: INR 10-100/min (tier=senior)
   */
  static perMinuteTierForYears(years: number): { tier: string; minPaise: number; maxPaise: number } {
    if (years < 4)  return { tier: 'new',      minPaise: 1000, maxPaise: 2000  };
    if (years < 10) return { tier: 'verified', minPaise: 1000, maxPaise: 5000  };
    return                { tier: 'senior',   minPaise: 1000, maxPaise: 10000 };
  }
}
