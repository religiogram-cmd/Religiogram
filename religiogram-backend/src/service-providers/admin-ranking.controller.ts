import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity, ProviderStatus } from './entities/provider.entity';
import { RankingService } from './ranking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Admin observability + control for the ranking algorithm.
 *
 *   GET  /admin/ranking/top       — top N approved by ranking_score
 *   POST /admin/ranking/recompute — force full recompute (async, returns count)
 *
 * The nightly cron does its own sweep; this endpoint exists for on-demand
 * refresh after admin edits a formula input (e.g. bulk-approving a batch of
 * pending providers, or fixing bad rating denorms).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/ranking', version: '1' })
export class AdminRankingController {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    private readonly ranking: RankingService,
  ) {}

  @Get('top')
  async top(@Query('limit') limit = '50') {
    const n = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const rows = await this.providers
      .createQueryBuilder('p')
      .where('p.status = :status', { status: ProviderStatus.Approved })
      .orderBy('p.ranking_score', 'DESC', 'NULLS LAST')
      .take(n)
      .getMany();
    return {
      items: rows.map((p) => ({
        id:                    p.id,
        fullName:              p.fullName,
        city:                  p.city,
        providerCategory:      p.providerCategory,
        rankingScore:          parseFloat(p.rankingScore as string),
        ratingAvg:             p.ratingAvg ? parseFloat(p.ratingAvg as string) : null,
        ratingCount:           p.ratingCount,
        completedBookingsCount: p.completedBookingsCount,
        isOnline:              p.isOnline,
        isVerified:            p.isVerified,
        experienceYears:       p.experienceYears,
        lastActivityAt:        p.lastActivityAt,
      })),
    };
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  async recompute() {
    return await this.ranking.recomputeAll();
  }
}
