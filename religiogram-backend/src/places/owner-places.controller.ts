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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerOrAdminGuard } from './guards/owner-or-admin.guard';
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
 * Owner-scoped management surface.
 *
 *   GET    /places/:id/manage/events            → owner or admin
 *   POST   /places/:id/manage/events
 *   PUT    /places/:id/manage/events/:eventId
 *   DELETE /places/:id/manage/events/:eventId
 *
 *   GET    /places/:id/manage/services          → owner or admin
 *   POST   /places/:id/manage/services
 *   PUT    /places/:id/manage/services/:serviceId
 *   DELETE /places/:id/manage/services/:serviceId
 *
 * These are deliberately separate from `/admin/places/:id/...`. The admin
 * surface lives there for unchanged admin tooling; this surface is for
 * the approved owner (role = 'seeker' by default, gated by ownership).
 *
 * Guard order matters: JwtAuthGuard attaches the user, then
 * OwnerOrAdminGuard reads `req.params.id` and decides.
 */
@Controller({ path: 'places', version: '1' })
@UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
export class OwnerPlacesController {
  constructor(private readonly places: PlacesService) {}

  /* ── events ── */

  @Get(':id/manage/events')
  listEvents(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('upcoming') upcoming?: string,
    @Query('limit') limit?: string,
  ) {
    const upcomingOnly = upcoming === '1';
    const n = limit ? Math.max(1, Math.min(200, Number(limit) || 100)) : 100;
    return this.places.listEvents(id, { upcomingOnly, limit: n });
  }

  @Post(':id/manage/events')
  createEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreatePlaceEventDto,
  ) {
    return this.places.createEvent(id, dto);
  }

  @Put(':id/manage/events/:eventId')
  updateEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() dto: UpdatePlaceEventDto,
  ) {
    return this.places.updateEvent(id, eventId, dto);
  }

  @Delete(':id/manage/events/:eventId')
  @HttpCode(200)
  deleteEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.places.deleteEvent(id, eventId);
  }

  /* ── services ── */

  @Get(':id/manage/services')
  listServices(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.places.listServices(id);
  }

  @Post(':id/manage/services')
  createService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreatePlaceServiceDto,
  ) {
    return this.places.createService(id, dto);
  }

  @Put(':id/manage/services/:serviceId')
  updateService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
    @Body() dto: UpdatePlaceServiceDto,
  ) {
    return this.places.updateService(id, serviceId, dto);
  }

  @Delete(':id/manage/services/:serviceId')
  @HttpCode(200)
  deleteService(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('serviceId', new ParseUUIDPipe({ version: '4' })) serviceId: string,
  ) {
    return this.places.deleteService(id, serviceId);
  }
}
