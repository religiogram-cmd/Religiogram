import {
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
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlacesService } from './places.service';
import {
  CreatePlaceEventDto,
  UpdatePlaceEventDto,
} from './dto/upsert-place-event.dto';
import {
  CreatePlaceServiceDto,
  UpdatePlaceServiceDto,
} from './dto/upsert-place-service.dto';

/**
 * Admin surface for place events + services.
 *
 *   POST   /admin/places/:id/events               → add event
 *   PUT    /admin/places/:id/events/:eventId      → update event
 *   DELETE /admin/places/:id/events/:eventId      → remove event
 *
 *   POST   /admin/places/:id/services             → add service
 *   PUT    /admin/places/:id/services/:serviceId  → update service
 *   DELETE /admin/places/:id/services/:serviceId  → remove service
 *
 *   GET    /admin/places/:id/events               → admin view (history + future)
 *   GET    /admin/places/:id/services             → admin view (same shape as public)
 *
 * We intentionally scope the admin routes under `/admin/places/:id/...`
 * rather than `/admin/events/...` so the parent/child relationship is
 * obvious from a log line and the FK integrity check is localised.
 *
 * Role gate: class-level @Roles('admin') restricts the entire surface.
 * A future "owner" role (place owner can edit their own events) can be
 * added by allowing both roles and scoping to the place_id via a
 * method-level guard.
 */
@Controller({ path: 'admin/places', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPlacesController {
  constructor(private readonly places: PlacesService) {}

  /* ── events ── */

  @Get(':id/events')
  listEvents(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('upcoming') upcoming?: string,
    @Query('limit') limit?: string,
  ) {
    const upcomingOnly = upcoming === '1';
    const n = limit ? Math.max(1, Math.min(200, Number(limit) || 100)) : 100;
    return this.places.listEvents(id, { upcomingOnly, limit: n });
  }

  @Post(':id/events')
  createEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreatePlaceEventDto,
  ) {
    return this.places.createEvent(id, dto);
  }

  @Put(':id/events/:eventId')
  updateEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() dto: UpdatePlaceEventDto,
  ) {
    return this.places.updateEvent(id, eventId, dto);
  }

  @Delete(':id/events/:eventId')
  @HttpCode(200)
  deleteEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.places.deleteEvent(id, eventId);
  }

  /* ── services ── */

  @Get(':id/services')
  listServices(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.places.listServices(id);
  }

  @Post(':id/services')
  createService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreatePlaceServiceDto,
  ) {
    return this.places.createService(id, dto);
  }

  @Put(':id/services/:serviceId')
  updateService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
    @Body() dto: UpdatePlaceServiceDto,
  ) {
    return this.places.updateService(id, serviceId, dto);
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(200)
  deleteService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
  ) {
    return this.places.deleteService(id, serviceId);
  }
}
