import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity, ProviderStatus } from './entities/provider.entity';
import { ProviderServiceEntity } from './entities/provider-service.entity';
import { Public } from '../auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';

/**
 * Public read-only provider directory.
 *
 * GET /providers           — paginated list of approved providers
 * GET /providers/:id       — single approved provider profile
 *
 * These routes carry @Public() so no JWT is required. They power the
 * "Priests" screen visible to unauthenticated users in the app.
 */
@Controller({ path: 'providers', version: '1' })
export class PublicProvidersController {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get()
  @CacheControl('public, max-age=60, stale-while-revalidate=120')
  async list(
    @Query('religion') religion?: string,
    @Query('city') city?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
    // ── Astrology / category filters (migration 068) ──
    // `category` narrows to 'priest' or 'astrologer'. Omit to include both.
    @Query('category') category?: string,
    // `specialisation` narrows astrologers to a specific practice
    // (e.g. "Vedic Astrology", "Tarot Reading"). Uses PG array-contains for
    // GIN-index acceleration.
    @Query('specialisation') specialisation?: string,
    // `channel` narrows to astrologers offering a specific real-time
    // channel: 'chat' | 'voice' | 'video'.
    @Query('channel') channel?: string,
  ) {
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

    const qb = this.providers
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.services', 'svc', 'svc.is_active = true')
      .leftJoinAndSelect('svc.service', 'sm')
      .where('p.status = :status', { status: ProviderStatus.Approved });

    if (religion) {
      qb.andWhere('p.religion = :religion', { religion: religion.toLowerCase() });
    }
    if (city) {
      qb.andWhere('LOWER(p.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    }
    if (search) {
      qb.andWhere(
        '(LOWER(p.full_name) LIKE :q OR LOWER(p.bio) LIKE :q)',
        { q: `%${search.toLowerCase()}%` },
      );
    }
    // Category filter — hits btree idx_providers_category.
    // Providers with category='both' appear on BOTH tabs, so
    //   ?category=priest      → matches ('priest', 'both')
    //   ?category=astrologer  → matches ('astrologer', 'both')
    //   ?category=both        → matches ('both') only (used by admin views)
    if (category) {
      const c = category.toLowerCase();
      if (c === 'priest' || c === 'astrologer') {
        qb.andWhere('p.provider_category IN (:...cats)', { cats: [c, 'both'] });
      } else if (c === 'both') {
        qb.andWhere('p.provider_category = :category', { category: 'both' });
      }
    }
    // Specialisation filter — hits GIN idx_providers_specialisations_gin.
    if (specialisation) {
      qb.andWhere(':spec = ANY(p.specialisations)', { spec: specialisation });
    }
    // Channel filter — hits GIN idx_providers_consultation_channels_gin.
    if (channel) {
      const ch = channel.toLowerCase();
      if (ch === 'chat' || ch === 'voice' || ch === 'video') {
        qb.andWhere(':ch = ANY(p.consultation_channels)', { ch });
      }
    }

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { d: string; i: string };
        qb.andWhere('(p.createdAt < :afterDate OR (p.createdAt = :afterDate AND p.id < :afterId))', { afterDate: d, afterId: i });
      } catch { /* invalid cursor — start from beginning */ }
    }
    /* Order by the denormalised marketplace ranking score (Phase 4). Falls
     * back to rating_avg and created_at for tie-breaks — old rows with a
     * default score of 0 still get some ordering signal. */
    const items = await qb
      .orderBy('p.ranking_score', 'DESC', 'NULLS LAST')
      .addOrderBy('p.rating_avg', 'DESC', 'NULLS LAST')
      .addOrderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(limitNum + 1)
      .getMany();
    const hasMore = items.length > limitNum;
    if (hasMore) items.pop();
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ d: last.createdAt?.toISOString?.() ?? '', i: last.id })).toString('base64url')
      : null;

    return {
      items: items.map(this.serialize),
      limit:   limitNum,
      hasMore,
      nextCursor,
    };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get(':id')
  @CacheControl('public, max-age=60, stale-while-revalidate=120')
  async getOne(@Param('id') id: string) {
    const p = await this.providers.findOne({
      where: { id, status: ProviderStatus.Approved },
      relations: ['services', 'services.service', 'availability'],
    });
    if (!p) throw new NotFoundException('Provider not found');
    return this.serialize(p);
  }

  private serialize(p: ProviderEntity) {
    return {
      id:                   p.id,
      fullName:             p.fullName,
      city:                 p.city,
      religion:             p.religion,
      experienceYears:      p.experienceYears,
      languages:            p.languages ?? [],
      bio:                  p.bio,
      ratingAvg:            p.ratingAvg ? parseFloat(p.ratingAvg as string) : null,
      ratingCount:          p.ratingCount,
      // Astrology-related fields (migration 068). Priest providers return
      // 'priest' + empty arrays here, which the marketplace UI treats as
      // hidden sections.
      providerCategory:     p.providerCategory,
      specialisations:      p.specialisations ?? [],
      // Per-spec years map (migration 069). Empty object = no years recorded.
      // Marketplace UI shows "Vedic Astrology · 12 yrs" style badges.
      specialisationYears:  p.specialisationYears ?? {},
      consultationChannels: p.consultationChannels ?? [],
      perMinutePaise:       p.perMinutePaise,
      serviceMode:          p.serviceMode,
      // Ranking signals (migration 071) — surface for UI badges (green dot
      // for online, verified checkmark, etc.).
      isOnline:             p.isOnline,
      isVerified:           p.isVerified,
      completedBookings:    p.completedBookingsCount,
      services:             (p.services ?? []).map(s => ({
        id:              s.id,
        name:            s.service?.name ?? s.customName ?? 'Custom Service',
        basePricePaise:  s.basePricePaise,
        durationMinutes: s.durationMinutes,
        mode:            s.mode,
      })),
    };
  }
}
