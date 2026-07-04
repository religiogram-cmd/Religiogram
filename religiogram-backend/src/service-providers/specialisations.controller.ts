import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SpecialisationEntity } from './entities/specialisation.entity';
import { ProviderEntity } from './entities/provider.entity';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';
import { Throttle } from '@nestjs/throttler';

/* ─────────── DTOs ─────────── */

class CreateSpecDto {
  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, digits, or hyphens' })
  slug!: string;

  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  @Length(2, 40)
  category!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsOptional()
  @IsBoolean()
  isPremiumOnly?: boolean;
}

class UpdateSpecDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @Length(2, 40) category?: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isTrending?: boolean;
  @IsOptional() @IsBoolean() isPremiumOnly?: boolean;
}

class ReorderItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

class ReorderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

/* ─────────── Public — used by the wizard picker ─────────── */

/**
 * Public specialisations catalogue. Returns only active items and only the
 * fields the picker needs. Cached at the edge — hot path.
 */
@Controller({ path: 'specialisations', version: '1' })
export class PublicSpecialisationsController {
  constructor(
    @InjectRepository(SpecialisationEntity)
    private readonly specs: Repository<SpecialisationEntity>,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @Get()
  @CacheControl('public, max-age=300, stale-while-revalidate=600')
  async list() {
    const rows = await this.specs.find({
      where: { isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
    // Group by category so the frontend can render sections without a
    // second sort pass. Order of categories follows the first row's order.
    const byCategory: Record<string, {
      category: string;
      items: Array<{ slug: string; name: string; isTrending: boolean; isPremiumOnly: boolean }>;
    }> = {};
    for (const r of rows) {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { category: r.category, items: [] };
      }
      byCategory[r.category]!.items.push({
        slug:          r.slug,
        name:          r.name,
        isTrending:    r.isTrending,
        isPremiumOnly: r.isPremiumOnly,
      });
    }
    return { categories: Object.values(byCategory) };
  }
}

/* ─────────── Admin — CRUD + reorder + usage counts ─────────── */

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/specialisations', version: '1' })
export class AdminSpecialisationsController {
  constructor(
    @InjectRepository(SpecialisationEntity)
    private readonly specs: Repository<SpecialisationEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
  ) {}

  /** List everything — active, inactive, all categories — for the admin UI. */
  @Get()
  async listAll(@Query('category') category?: string) {
    const qb = this.specs.createQueryBuilder('s');
    if (category) qb.where('s.category = :cat', { cat: category });
    qb.orderBy('s.category', 'ASC')
      .addOrderBy('s.sortOrder', 'ASC')
      .addOrderBy('s.name', 'ASC');
    return { items: await qb.getMany() };
  }

  /** Usage count for a specialisation — how many providers list it.
   *  Uses the text[] `specialisations` column with GIN idx for the query. */
  @Get(':id/usage')
  async usage(@Param('id') id: string) {
    const spec = await this.specs.findOne({ where: { id } });
    if (!spec) throw new NotFoundException('Specialisation not found');
    const count: { count: string }[] = await this.providers.query(
      `SELECT COUNT(*)::text AS count
       FROM providers
       WHERE $1 = ANY(specialisations) AND status = 'approved'`,
      [spec.name],
    );
    return {
      id:              spec.id,
      slug:            spec.slug,
      name:            spec.name,
      providers:       parseInt(count[0]?.count ?? '0', 10),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSpecDto) {
    const existing = await this.specs.findOne({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException(`Slug "${dto.slug}" already exists`);
    const row = this.specs.create({
      slug:          dto.slug,
      name:          dto.name,
      category:      dto.category,
      description:   dto.description ?? null,
      sortOrder:     dto.sortOrder ?? 100,
      isActive:      dto.isActive ?? true,
      isTrending:    dto.isTrending ?? false,
      isPremiumOnly: dto.isPremiumOnly ?? false,
    });
    return await this.specs.save(row);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSpecDto) {
    const row = await this.specs.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Specialisation not found');
    if (dto.name          !== undefined) row.name          = dto.name;
    if (dto.category      !== undefined) row.category      = dto.category;
    if (dto.description   !== undefined) row.description   = dto.description ?? null;
    if (dto.sortOrder     !== undefined) row.sortOrder     = dto.sortOrder;
    if (dto.isActive      !== undefined) row.isActive      = dto.isActive;
    if (dto.isTrending    !== undefined) row.isTrending    = dto.isTrending;
    if (dto.isPremiumOnly !== undefined) row.isPremiumOnly = dto.isPremiumOnly;
    return await this.specs.save(row);
  }

  /**
   * Delete a spec. This is a HARD DELETE — use with care: any provider
   * with this specialisation on their `specialisations text[]` column will
   * still have the string, but it won't render in the wizard picker. For
   * routine "hide from picker" use `PATCH { isActive: false }` instead.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    const row = await this.specs.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Specialisation not found');
    await this.specs.delete({ id });
  }

  /** Batch-update sort_order for a set of rows. Typical use: admin drags
   *  entries around in the UI and sends the new order for the whole
   *  category in one shot. */
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Body() dto: ReorderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    // One UPDATE per row — simple, correct, and the list is tiny (~50 rows
    // per category in the worst case). If this ever gets hot we can do a
    // single CTE-based UPDATE.
    for (const it of dto.items) {
      await this.specs.update({ id: it.id }, { sortOrder: it.sortOrder });
    }
    return { updated: dto.items.length };
  }
}
