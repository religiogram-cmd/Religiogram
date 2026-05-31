import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { QueryPriestsDto, SortBy } from './dto/query-priests.dto';
import { ProviderEntity as Provider, ProviderStatus } from '../service-providers/entities/provider.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CatalogService } from '../catalog/catalog.service';
import { ProviderIndexService } from '../opensearch/provider-index.service';

@Injectable()
export class PriestsService {
  constructor(
    @InjectRepository(Provider) private readonly providerRepo: Repository<Provider>,
    @InjectRepository(Booking)  private readonly bookingRepo: Repository<Booking>,
    private readonly catalogSvc: CatalogService,
    @Optional() private readonly providerIndex?: ProviderIndexService,
  ) {}

  // â”€â”€ findAll â€” cursor-based pagination (no OFFSET) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async findAll(dto: QueryPriestsDto): Promise<{
    data: Provider[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(dto.limit ?? 20, 50);

    const qb = this.providerRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: ProviderStatus.Approved });

    // â”€â”€ Cursor decode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Cursor shape depends on active sort:
    //   default: { mode:'default', isVerified, ratingAvg, id }
    //   RATING:  { mode:'rating',  ratingAvg, id }
    //   PRICE:   { mode:'price',   price, id }
    //   EXPERIENCE: { mode:'experience', experience, id }
    //   legacy:  { createdAt, id }  â€” gracefully degraded to start-of-page
    if (dto.cursor) {
      try {
        const decoded: Record<string, unknown> = JSON.parse(
          Buffer.from(dto.cursor, 'base64url').toString('utf8'),
        );
        const mode = decoded['mode'] as string | undefined;
        if (mode === 'default') {
          // (is_verified DESC, rating_avg DESC NULLS LAST, id DESC) keyset
          qb.andWhere(
            `(p.is_verified < :cur_iv
              OR (p.is_verified = :cur_iv AND (p.rating_avg < :cur_ra OR p.rating_avg IS NULL)
                  AND :cur_ra IS NOT NULL)
              OR (p.is_verified = :cur_iv AND p.rating_avg IS NOT DISTINCT FROM :cur_ra
                  AND p.id < :cur_id))`,
            { cur_iv: decoded['isVerified'], cur_ra: decoded['ratingAvg'] ?? null, cur_id: decoded['id'] },
          );
        } else if (mode === 'rating') {
          qb.andWhere(
            `(p.rating_avg < :cur_ra OR (p.rating_avg IS NOT DISTINCT FROM :cur_ra AND p.id < :cur_id))`,
            { cur_ra: decoded['ratingAvg'] ?? null, cur_id: decoded['id'] },
          );
        } else if (mode === 'price') {
          qb.andWhere(
            `(p.per_minute_paise > :cur_p OR (p.per_minute_paise = :cur_p AND p.id < :cur_id))`,
            { cur_p: decoded['price'], cur_id: decoded['id'] },
          );
        } else if (mode === 'experience') {
          qb.andWhere(
            `(p.experience_years < :cur_e OR (p.experience_years = :cur_e AND p.id < :cur_id))`,
            { cur_e: decoded['experience'], cur_id: decoded['id'] },
          );
        }
        // legacy cursor shape (createdAt+id) â€” ignore and restart from page 1
      } catch {
        // Malformed cursor â€” ignore and start from the beginning
      }
    }

    // â”€â”€ Filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (dto.faith) {
      qb.andWhere('p.religion = :faith', { faith: dto.faith });
    }
    if (dto.city) {
      qb.andWhere('LOWER(p.city) = LOWER(:city)', { city: dto.city });
    }
    if (dto.service) {
      // ProviderEntity.services is a OneToMany relation to ProviderServiceEntity
      qb.innerJoin('p.services', 'ps', 'LOWER(ps.name) = LOWER(:svc)', { svc: dto.service });
    }
    if (dto.search) {
      const q = dto.search.trim();
      // Route through OpenSearch for full-text search (avoids full table scan).
      // Falls back to Postgres FTS when OpenSearch returns no hits or errors.
      try {
        const osResult = (await this.providerIndex?.search({
          query: q,
          religion: dto.faith,
          city: dto.city,
          size: 200,
        })) ?? { providers: [], total: 0 };
        if (osResult.providers.length > 0) {
          const ids = osResult.providers.map((p) => p.id);
          qb.andWhere('p.id IN (:...searchIds)', { searchIds: ids });
        } else {
          // Fallback: use Postgres FTS via to_tsquery to avoid leading-wildcard table scan
          qb.andWhere(
            `to_tsvector('english', COALESCE(p.full_name, '') || ' ' || COALESCE(p.bio, '')) @@ plainto_tsquery('english', :ftsQuery)`,
            { ftsQuery: q },
          );
        }
      } catch {
        // If OpenSearch is unavailable, fall back to Postgres FTS
        qb.andWhere(
          `to_tsvector('english', COALESCE(p.full_name, '') || ' ' || COALESCE(p.bio, '')) @@ plainto_tsquery('english', :ftsQuery)`,
          { ftsQuery: q },
        );
      }
    }
    if (dto.isOnline) {
      qb.andWhere('p.service_mode IN (:...onlineModes)', {
        onlineModes: ['online', 'both'],
      });
    }

    // â”€â”€ Price range filter (per-minute paise) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (dto.minPrice != null) {
      qb.andWhere('p.per_minute_paise >= :minPrice', { minPrice: dto.minPrice });
    }
    if (dto.maxPrice != null) {
      qb.andWhere('p.per_minute_paise <= :maxPrice', { maxPrice: dto.maxPrice });
    }

    // â”€â”€ Geo-distance filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (dto.lat != null && dto.lng != null) {
      // Compute the distance as a named SELECT expression for ORDER BY DISTANCE support
      qb.addSelect(
        `( 6371 * acos( LEAST(1.0, cos(radians(:lat)) * cos(radians(p.latitude)) *
           cos(radians(p.longitude) - radians(:lng)) +
           sin(radians(:lat)) * sin(radians(p.latitude)) ) ) )`,
        'distance_km',
      ).setParameters({ lat: dto.lat, lng: dto.lng });
      if (dto.radiusKm) {
        // Use WHERE with the inline formula rather than HAVING to avoid needing GROUP BY.
        // The alias 'distance_km' is not yet visible in WHERE, so repeat the expression.
        qb.andWhere(
          `( 6371 * acos( LEAST(1.0, cos(radians(:lat)) * cos(radians(p.latitude)) *
             cos(radians(p.longitude) - radians(:lng)) +
             sin(radians(:lat)) * sin(radians(p.latitude)) ) ) ) <= :radiusKm`,
          { radiusKm: dto.radiusKm },
        );
      }
    }

    // â”€â”€ Sort â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    switch (dto.sortBy) {
      case SortBy.RATING:
        qb.orderBy('p.rating_avg', 'DESC', 'NULLS LAST')
          .addOrderBy('p.created_at', 'DESC')
          .addOrderBy('p.id', 'DESC');
        break;
      case SortBy.PRICE:
        qb.orderBy('p.per_minute_paise', 'ASC', 'NULLS LAST')
          .addOrderBy('p.created_at', 'DESC')
          .addOrderBy('p.id', 'DESC');
        break;
      case SortBy.EXPERIENCE:
        qb.orderBy('p.experience_years', 'DESC', 'NULLS LAST')
          .addOrderBy('p.created_at', 'DESC')
          .addOrderBy('p.id', 'DESC');
        break;
      case SortBy.DISTANCE:
        if (dto.lat != null && dto.lng != null) {
          qb.orderBy('distance_km', 'ASC')
            .addOrderBy('p.created_at', 'DESC')
            .addOrderBy('p.id', 'DESC');
        } else {
          qb.orderBy('p.rating_avg', 'DESC', 'NULLS LAST')
            .addOrderBy('p.created_at', 'DESC')
            .addOrderBy('p.id', 'DESC');
        }
        break;
      default:
        // Default marketplace sort: verified providers first, then by rating.
        // Composite index IDX_providers_verified_rating supports this sort.
        qb.orderBy('p.is_verified', 'DESC')
          .addOrderBy('p.rating_avg', 'DESC', 'NULLS LAST')
          .addOrderBy('p.id', 'DESC');
    }

    // Fetch one extra row to detect hasMore
    qb.take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const last = data[data.length - 1];
      // Encode sort-mode in cursor so decode can apply the correct keyset predicate
      const sortBy = dto.sortBy;
      let cursorPayload: Record<string, unknown>;
      if (!sortBy) {
        cursorPayload = { mode: 'default', isVerified: last.isVerified ?? false, ratingAvg: last.ratingAvg ?? null, id: last.id };
      } else if (sortBy === 'rating') {
        cursorPayload = { mode: 'rating', ratingAvg: last.ratingAvg ?? null, id: last.id };
      } else if (sortBy === 'price') {
        cursorPayload = { mode: 'price', price: last.perMinutePaise ?? null, id: last.id };
      } else if (sortBy === 'experience') {
        cursorPayload = { mode: 'experience', experience: last.experienceYears ?? null, id: last.id };
      } else {
        // DISTANCE and others: re-fetch from page 1 (distance is ephemeral)
        cursorPayload = { mode: 'default', isVerified: last.isVerified ?? false, ratingAvg: last.ratingAvg ?? null, id: last.id };
      }
      nextCursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64url');
    }

    return { data, nextCursor, hasMore };
  }

  // â”€â”€ findOne â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async findOne(id: string): Promise<Provider> {
    const provider = await this.providerRepo.findOne({
      where: { id, status: ProviderStatus.Approved },
      relations: ['services', 'availability'],
    });
    if (!provider) throw new NotFoundException('Priest not found');
    return provider;
  }

  // â”€â”€ getServices â€” live catalog, no hardcoded arrays â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getServices(faith?: string) {
    return this.catalogSvc.listServices(faith);
  }

  // â”€â”€ getStats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getStats(providerId: string) {
    const provider = await this.findOne(providerId);
    const [totalBookings, completedBookings] = await Promise.all([
      this.bookingRepo.count({ where: { providerId } }),
      this.bookingRepo.count({
        where: { providerId, status: 'completed' as any },
      }),
    ]);
    return {
      providerId,
      totalBookings,
      completedBookings,
      completionRate: totalBookings
        ? Math.round((completedBookings / totalBookings) * 100)
        : 0,
      ratingAvg: Number(provider.ratingAvg ?? 0),
      ratingCount: provider.ratingCount ?? 0,
    };
  }

  // â”€â”€ getOnlinePriests â€” bounded, correct fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getOnlinePriests(faith?: string, limit = 20): Promise<Provider[]> {
    const safeLimit = Math.min(limit, 50);
    const qb = this.providerRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: ProviderStatus.Approved })
      .andWhere('p.service_mode IN (:...onlineModes)', {
        onlineModes: ['online', 'both'],
      });

    if (faith) {
      qb.andWhere('p.religion = :faith', { faith });
    }

    return qb
      .orderBy('p.rating_avg', 'DESC', 'NULLS LAST')
      .take(safeLimit)
      .getMany();
  }

  // â”€â”€ search â€” pg_trgm similarity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async search(q: string, limit = 20): Promise<Provider[]> {
    const safeLimit = Math.min(limit, 50);
    const term = q.trim();
    if (!term) return [];

    return this.providerRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: ProviderStatus.Approved })
      .andWhere(
        `(
          LOWER(p.full_name) % LOWER(:q) OR
          LOWER(p.bio) % LOWER(:q) OR
          similarity(LOWER(p.full_name), LOWER(:q)) > 0.1
        )`,
        { q: term },
      )
      .orderBy(
        `GREATEST(
          COALESCE(similarity(LOWER(p.full_name), LOWER(:q2)), 0),
          COALESCE(similarity(LOWER(p.bio),       LOWER(:q2)), 0)
        )`,
        'DESC',
      )
      .setParameter('q2', term)
      .take(safeLimit)
      .getMany();
  }
}

