import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CacheControl } from '../common/interceptors/cache-control.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { OwnerOrAdminGuard } from './guards/owner-or-admin.guard';
import { PlacesService } from './places.service';
import { PlaceReviewsService, CreateReviewDto } from './place-reviews.service';
import { PlaceDonationsService, CreateDonationOrderDto, VerifyDonationDto } from './place-donations.service';
import { GooglePlacesService } from './google-places.service';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../uploads/uploads.service';
import { IsIn, IsInt, Max as MaxV, Min as MinV } from 'class-validator';

class PresignGalleryDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsInt()
  @MinV(1)
  @MaxV(10 * 1024 * 1024)
  sizeBytes!: number;
}

interface JwtUser { id: string; role: string }

@Controller({ path: 'places', version: '1' })
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly reviews: PlaceReviewsService,
    private readonly donations: PlaceDonationsService,
    private readonly google: GooglePlacesService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  /* ── Google search / import ─────────────────────────────────────── */

  /**
   * Native catalog search — lookup against the indexed `temples` table
   * without burning Google quota. Public + cacheable. Returns up to `limit`
   * rows ordered by review count then name.
   */
  @Public()
  @Get('search')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @CacheControl('public, s-maxage=60, stale-while-revalidate=120')
  async searchNative(
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    const items = await this.places.searchNative({
      q,
      city,
      type,
      limit: limit ? Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100) : 30,
    });
    return { items, source: 'native' };
  }

  @Public()
  @Get('search/google')
  @UseGuards(UserThrottlerGuard)

  /**
   * S4: Server-side proxy for Google Places photos.
   * The frontend never sees the GOOGLE_PLACES_API_KEY — only this endpoint
   * touches the Google API. Requests without a valid ref are rejected.
   *
   * Rate-limited to 120 req/min per user (same as search/google).
   */
  @Public()
  @Get('photo')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async proxyPhoto(
    @Query('ref') ref: string,
    @Query('maxwidth') maxwidth = '400',
    @Res() res: Response,
  ) {
    if (!ref || ref.length > 500) {
      throw new BadRequestException('Invalid photo reference');
    }
    const apiKey = this.config.getOrThrow<string>('google.placesApiKey');
    // apiKey is guaranteed non-empty by getOrThrow above
    const googleUrl =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=${encodeURIComponent(maxwidth)}` +
      `&photo_reference=${encodeURIComponent(ref)}` +
      `&key=${apiKey}`;
    try {
      const upstream = await axios.get(googleUrl, {
        responseType: 'stream',
        timeout: 10_000,
        maxRedirects: 3,
      });
      const ct = String(upstream.headers['content-type'] ?? 'image/jpeg');
      // Only proxy image content types — never proxy HTML error pages
      if (!ct.startsWith('image/')) {
        res.status(502).json({ error: 'Upstream returned non-image' });
        return;
      }
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      upstream.data.pipe(res);
    } catch (err: any) {
      res.status(502).json({ error: 'Photo fetch failed' });
    }
  }
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  searchGoogle(
    @Query('q')   q?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('religion') religion?: string,
    @Query('radius') radius?: string,
  ) {
    const coords = parseCoords(lat, lng);
    if (q) return this.google.textSearch(q, coords?.lat, coords?.lng);
    if (!coords) throw new BadRequestException('Either q or (lat + lng) is required');
    return this.google.searchNearby({ lat: coords.lat, lng: coords.lng, religion, radius: radius ? Number(radius) : undefined });
  }

  @Post('google/import')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  importGooglePlace(@Body('googlePlaceId') googlePlaceId: string) {
    if (!googlePlaceId) throw new BadRequestException('googlePlaceId is required');
    return this.google.importPlace(googlePlaceId);
  }

  /* ── User's own donations across all places ─────────────────────── */

  @Get('donations/all-mine')
  @UseGuards(JwtAuthGuard)
  getAllMyDonations(@CurrentUser() user: JwtUser) {
    return this.donations.listMine(user.id);
  }

  /* ── Place profile (public) ─────────────────────────────────────── */

  @Public()
  @Get(':id')
  @CacheControl('public, max-age=30, stale-while-revalidate=120')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.places.getDetail(id, parseCoords(lat, lng));
  }

  @Public()
  @Get(':id/events')
  @CacheControl('public, max-age=30, stale-while-revalidate=120')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listEvents(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('upcoming') upcoming?: string,
    @Query('limit') limit?: string,
  ) {
    return this.places.listEvents(id, {
      upcomingOnly: upcoming === undefined ? true : upcoming !== '0',
      limit: limit ? Math.min(100, Math.max(1, Number(limit) || 50)) : 50,
    });
  }

  @Public()
  @Get(':id/services')
  @CacheControl('public, max-age=60, stale-while-revalidate=300')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listServices(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.places.listServices(id);
  }

  @Public()
  @Get(':id/nearby')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  nearby(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    const coords = parseCoords(lat, lng);
    return this.places.listNearby(id, {
      lat: coords?.lat, lng: coords?.lng,
      radiusKm: radiusKm !== undefined ? Number(radiusKm) : undefined,
      limit:    limit    !== undefined ? Number(limit)    : undefined,
    });
  }

  /* ── Gallery (owner or admin) ───────────────────────────────────── */

  /**
   * Mint a presigned PUT URL for a gallery image. The client PUTs the bytes
   * directly to S3, then calls POST /:id/gallery with the returned
   * `publicUrl` to persist it on the place row.
   */
  @Post(':id/gallery/presign')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  presignGalleryPhoto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PresignGalleryDto,
  ) {
    return this.uploads.createPlaceGalleryPresign(id, dto.contentType, dto.sizeBytes);
  }

  @Post(':id/gallery')
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  addGalleryPhoto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    return this.places.addGalleryPhoto(id, imageUrl);
  }

  @Delete(':id/gallery')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  removeGalleryPhoto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    return this.places.removeGalleryPhoto(id, imageUrl);
  }

  @Put(':id/gallery/cover')
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  setCoverPhoto(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    return this.places.setCoverPhoto(id, imageUrl);
  }

  /* ── Reviews (public read, auth write) ─────────────────────────── */

  @Public()
  @Get(':id/reviews')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listReviews(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sort')  sort?: string,
  ) {
    return this.reviews.listReviews(id, {
      cursor,
      limit: limit ? Number(limit) : 10,
      sort:  (sort as 'newest' | 'highest' | 'helpful') ?? 'newest',
    });
  }

  @Get(':id/reviews/mine')
  @UseGuards(JwtAuthGuard)
  getMyReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviews.getMyReview(id, user.id);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  upsertReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.upsertReview(id, user.id, dto);
  }

  @Delete(':id/reviews/mine')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  deleteMyReview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviews.deleteReview(id, user.id);
  }

  @Post(':id/reviews/:reviewId/helpful')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  markHelpful(
    @Param('reviewId', new ParseUUIDPipe({ version: '4' })) reviewId: string,
  ) {
    return this.reviews.markHelpful(reviewId);
  }

  /* ── Donations (public stats, auth order/verify) ────────────────── */

  @Public()
  @Get(':id/donations/stats')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getDonationStats(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.donations.getStats(id);
  }

  @Post(':id/donations/order')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createDonationOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDonationOrderDto,
  ) {
    return this.donations.createOrder(id, user.id, dto);
  }

  @Post(':id/donations/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyDonation(
    @CurrentUser() user: JwtUser,
    @Body() dto: VerifyDonationDto,
  ) {
    return this.donations.verifyPayment(user.id, dto);
  }

  @Get(':id/donations/mine')
  @UseGuards(JwtAuthGuard)
  getMyDonations(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.donations.listMine(user.id, id);
  }
}

function parseCoords(lat?: string, lng?: string): { lat: number; lng: number } | null {
  const lp = lat !== undefined && lat !== '';
  const lnp = lng !== undefined && lng !== '';
  if (!lp && !lnp) return null;
  if (lp !== lnp) throw new BadRequestException('Both lat and lng are required, or neither');
  const ln = Number(lat); const lgn = Number(lng);
  if (!Number.isFinite(ln) || !Number.isFinite(lgn) || ln < -90 || ln > 90 || lgn < -180 || lgn > 180)
    throw new BadRequestException('Invalid lat / lng');
  return { lat: ln, lng: lgn };
}
