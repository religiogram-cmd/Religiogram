import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';

/**
 * Catalog data (religions, service types) changes extremely infrequently —
 * admins update it a few times a year. Cache aggressively with a long
 * stale-while-revalidate window so it effectively loads from CDN/browser
 * cache after the first request.
 */
const CATALOG_CACHE = 'public, max-age=300, stale-while-revalidate=3600';

@ApiTags('Catalog')
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('religions')
  @CacheControl(CATALOG_CACHE)
  @ApiOperation({ summary: 'List all active religions' })
  listReligions() { return this.catalog.listReligions(); }

  @Public()
  @Get('religions/:slug')
  @CacheControl(CATALOG_CACHE)
  @ApiOperation({ summary: 'Get religion with categories and roles' })
  getReligion(@Param('slug') slug: string) { return this.catalog.getReligion(slug); }

  @Public()
  @Get('religions/:slug/roles')
  @CacheControl(CATALOG_CACHE)
  @ApiOperation({ summary: 'Get provider roles for a religion' })
  getRoles(@Param('slug') slug: string) { return this.catalog.listRolesForReligion(slug); }

  @Public()
  @Get('services')
  @CacheControl(CATALOG_CACHE)
  @ApiOperation({ summary: 'List services, optionally filtered by religion/type' })
  listServices(
    @Query('religion') religion?: string,
    @Query('type') type?: string,
  ) { return this.catalog.listServices(religion, type); }

  @Public()
  @Get('services/:id')
  @CacheControl(CATALOG_CACHE)
  @ApiOperation({ summary: 'Get a single service by ID' })
  getService(@Param('id') id: string) { return this.catalog.getService(id); }
}
