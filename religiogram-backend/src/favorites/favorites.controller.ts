import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { FavoritesService } from './favorites.service';

/**
 * Favorites — authenticated retention surface.
 *
 *   GET    /favorites                → list current user's favorites
 *   GET    /favorites/ids?ids=…,…   → bulk "is favorite?" lookup
 *   POST   /favorites/:templeId      → add (idempotent)
 *   DELETE /favorites/:templeId      → remove (idempotent)
 *
 * Rate limits are looser than /temples because the volume is naturally
 * self-limiting — a user can only heart/un-heart so many cards per minute
 * before fatigue kicks in. We still keep a ceiling to block toggle spam.
 */
@Controller({ path: 'favorites', version: '1' })
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.list(user.id);
  }

  /**
   * Bulk membership check. The client calls this with the page's visible
   * temple ids (local list, all-india page, recently-viewed) so every
   * card can render its heart icon in the correct state from one RTT.
   *
   * Query shape:  /favorites/ids?ids=uuid1,uuid2,uuid3
   *
   * We keep it GET (not POST) so it's cacheable at the HTTP layer if we
   * ever add a varnish / CDN edge; the id-list is short enough to fit in
   * a URL for all realistic pages (≤ 100 ids × 37 chars each = ~3.7 KB,
   * well under the 8 KB reverse-proxy default).
   */
  @Get('ids')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async getIds(
    @CurrentUser() user: AuthenticatedUser,
    @Query('ids') ids?: string,
  ): Promise<{ ids: string[] }> {
    const parsed = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const set = await this.favorites.getFavoriteIds(user.id, parsed);
    return { ids: Array.from(set) };
  }

  /**
   * Add. 202 Accepted semantics would be cleaner but 201 Created is the
   * convention the rest of this API uses for idempotent POST endpoints,
   * and we don't want to invent a new envelope shape for one route.
   *
   * Returns { added: true } on first insert, { added: false } on a repeat
   * tap — the UI can ignore the flag but product analytics finds it useful.
   */
  @Post(':templeId')
  @HttpCode(201)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templeId', new ParseUUIDPipe({ version: '4' })) templeId: string,
  ) {
    return this.favorites.add(user.id, templeId);
  }

  @Delete(':templeId')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templeId', new ParseUUIDPipe({ version: '4' })) templeId: string,
  ) {
    return this.favorites.remove(user.id, templeId);
  }
}
