import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { FileKind } from './entities/user-file.entity';
import { UploadsService } from './uploads.service';

/**
 * Upload endpoints — all require a valid JWT (covered by global JwtAuthGuard).
 *
 *   POST   /uploads/presign      → server signs a 5-min PUT URL for S3
 *   POST   /uploads/confirm      → client tells us the PUT landed
 *   GET    /uploads?kind=...     → list current user's confirmed files
 *   GET    /uploads/:id          → fetch a single owned file's metadata
 *
 * The backend never proxies file bytes. Bandwidth bills stay on S3 / CDN
 * and the API stays small + horizontally scalable.
 */
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Sign a 5-minute PUT URL for a direct-to-S3 upload.
   *
   * Rate-limited per-user at 10 requests / minute via UserThrottlerGuard.
   * Prevents a compromised account from minting thousands of presigned
   * URLs and either abusing S3 capacity or probing the policy surface.
   *
   * The global throttler (100 req/min/IP) still applies as a first line —
   * this adds a stricter second line keyed on the authenticated user.
   */
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignUploadDto,
  ) {
    return this.uploads.createPresign(user.id, dto);
  }

  /**
   * Confirm a previously-signed upload landed on S3.
   *
   * Lighter rate limit (30/min/user) — this is called once per successful
   * PUT, so a stricter cap is fine.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ) {
    const file = await this.uploads.confirm(user.id, dto.fileId);
    return {
      id: file.id,
      kind: file.kind,
      url: file.url,
      contentType: file.contentType,
      sizeBytes: Number(file.sizeBytes),
      status: file.status,
      createdAt: file.createdAt,
    };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('kind') kind: FileKind,
  ) {
    const rows = await this.uploads.listByKind(user.id, kind);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      url: r.url,
      contentType: r.contentType,
      sizeBytes: Number(r.sizeBytes),
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const r = await this.uploads.getOwned(user.id, id);
    return {
      id: r.id,
      kind: r.kind,
      url: r.url,
      contentType: r.contentType,
      sizeBytes: Number(r.sizeBytes),
      status: r.status,
      createdAt: r.createdAt,
    };
  }
}
