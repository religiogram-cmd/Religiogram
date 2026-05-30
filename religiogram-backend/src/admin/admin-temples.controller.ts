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
import { AdminTemplesService } from './admin-temples.service';
import {
  CreateTempleDto,
  ListAdminTemplesDto,
  UpdateTempleDto,
} from './dto/upsert-temple.dto';

/**
 * Admin surface for the temples catalogue.
 *
 * Security posture
 * ----------------
 *   - JwtAuthGuard ensures a valid session.
 *   - RolesGuard + @Roles('admin') restricts every route to accounts
 *     whose `role` column is 'admin'. This is enforced per-class; no
 *     route escapes the gate.
 *   - No rate limit override — the global 100 rpm/IP limiter is plenty
 *     for manual admin work. Automated catalogue imports should go
 *     through a script with its own auth, not this surface.
 *
 * Route naming
 * ------------
 *   Mounted under `/api/v1/admin/temples` to keep the namespace distinct
 *   from the public `/api/v1/temples` routes. A /temples GET through
 *   this controller returns MUCH more (all fields, unverified included,
 *   larger page size) than the public one — the path prefix keeps that
 *   difference visible to anyone reading a log line.
 */
@Controller({ path: 'admin/temples', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminTemplesController {
  constructor(private readonly svc: AdminTemplesService) {}

  @Get()
  list(@Query() dto: ListAdminTemplesDto) {
    return this.svc.list(dto);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateTempleDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTempleDto,
  ) {
    return this.svc.update(id, dto);
  }

  /**
   * Hard delete. Justification: the temples table is small and admin-
   * curated; soft-delete would add an `is_deleted` column + filter on
   * every read, which isn't worth the complexity at catalogue size.
   * Paper trail lives in the app's audit log (separate module).
   */
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.svc.remove(id);
  }
}
