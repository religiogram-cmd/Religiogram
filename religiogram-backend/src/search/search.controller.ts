import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { SearchDto } from './dto/search.dto';

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * S-FT1: Apply dedicated throttle on search endpoint.
   * Full-text queries hit the DB with a Seq/Bitmap scan even with GIN indexes
   * on low-cardinality queries (e.g. single-letter queries). Throttle to
   * 30 req/min per IP to prevent search-DoS.
   */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Full-text search across temples and service providers' })
  @ApiQuery({ name: 'q', description: 'Search query (min 2 chars)', example: 'ram mandir' })
  @ApiQuery({ name: 'city', required: false, description: 'Filter by city', example: 'Varanasi' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (1-50, default 20)', example: 20 })
  async search(@Query() dto: SearchDto) {
    return this.searchService.search(dto.q, dto.city, dto.limit);
  }
}
