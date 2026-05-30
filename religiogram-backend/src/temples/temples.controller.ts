import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { ListTemplesDto } from './dto/list-temples.dto';
import { NearbyTemplesDto } from './dto/nearby-temples.dto';
import { SearchTemplesDto } from './dto/search-temples.dto';
import { TemplesService } from './temples.service';

/**
 * Temple Discovery — authenticated read-only surface.
 *
 *   GET /temples/nearby?lat=&lng=&radiusKm=&limit=           (GPS centre)
 *   GET /temples/nearby?city=delhi&radiusKm=&limit=          (city fallback)
 *   GET /temples?search=&city=&page=&limit=                  (All India list)
 *   GET /temples/search?q=                                   (manual fallback)
 *   GET /temples/cities                                      (city picker)
 *   GET /temples/:id                                         (detail page)
 *
 * Every route requires a valid JWT (global JwtAuthGuard). Per-user rate
 * limiting sits on top of the global 100-rpm/IP limiter.
 */
@Controller({ path: 'temples', version: '1' })
export class TemplesController {
  constructor(private readonly temples: TemplesService) {}

  /**
   * Radius-based geo query. Cached; typically resolves in <20 ms.
   * 60 req/min/user is wide enough for a user swiping around the map,
   * tight enough to block a scraper.
   */
  @Get('nearby')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async nearby(@Query() dto: NearbyTemplesDto) {
    return this.temples.nearby(dto);
  }

  /**
   * Manual-search fallback, hit when Google Autocomplete is down or
   * quota-throttled. Intentionally separate from `/temples` so the
   * client can distinguish the two billing surfaces.
   *
   * 60 req/min/user — matches the debounced typing rate with headroom.
   */
  @Get('search')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async search(@Query() dto: SearchTemplesDto) {
    return this.temples.search(dto);
  }

  /**
   * Distinct verified city slugs — used to populate the city picker in the
   * Explore screen. Low-write data; can safely be cached by the client for
   * the session duration.
   */
  @Get('cities')
  async cities() {
    return this.temples.findCities();
  }

  /**
   * All-India paged list. Supports optional `search`, `city`, and `religion`
   * filters. 30 req/min/user is enough for real typing at 300 ms debounce;
   * anything faster is a bot.
   */
  @Get()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async list(@Query() dto: ListTemplesDto) {
    return this.temples.list(dto);
  }

  /**
   * Detail page — returns the full Temple entity (includes description,
   * placeType, all metadata). Cached by the client; no server-side cache
   * needed at this scale.
   */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.temples.findById(id);
  }
}
