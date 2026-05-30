import {
  Controller, Get, Param, Query, UseGuards,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PriestsService } from './priests.service';
import { QueryPriestsDto } from './dto/query-priests.dto';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';

@ApiTags('priests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'priests', version: '1' })
export class PriestsController {
  constructor(private readonly priestsService: PriestsService) {}

  @Get()
  @CacheControl('public, max-age=60, stale-while-revalidate=120')
  @ApiOperation({
    summary: 'List approved priests — cursor-based pagination. Pass nextCursor as ?cursor= on subsequent pages.',
  })
  findAll(@Query() dto: QueryPriestsDto) {
    return this.priestsService.findAll(dto);
  }

  @Get('online')
  @CacheControl('public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Get providers available for online consultation' })
  @ApiQuery({ name: 'faith', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getOnline(
    @Query('faith') faith?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.priestsService.getOnlinePriests(faith, limit);
  }

  @Get('search')
  @CacheControl('public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Fuzzy full-text search using pg_trgm similarity' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.priestsService.search(q, limit);
  }

  @Get('services')
  @CacheControl('public, max-age=300, stale-while-revalidate=600')
  @ApiOperation({ summary: 'Get live service catalogue from the catalog module, optionally filtered by faith' })
  @ApiQuery({ name: 'faith', required: false })
  getServices(@Query('faith') faith?: string) {
    return this.priestsService.getServices(faith);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get booking stats for a specific priest' })
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.priestsService.getStats(id);
  }

  @Get(':id')
  @CacheControl('public, max-age=60, stale-while-revalidate=120')
  @ApiOperation({ summary: 'Get priest profile by provider ID' })
  findOne(@Param('id') id: string) {
    return this.priestsService.findOne(id);
  }
}
