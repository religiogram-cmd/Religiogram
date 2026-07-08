import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  UserReport,
  UserReportTargetType,
} from './entities/user-report.entity';
import { UserBlock } from './entities/user-block.entity';

class CreateReportDto {
  @IsIn(['post', 'comment', 'user', 'message'])
  targetType!: UserReportTargetType;

  @IsString() @MinLength(1) @MaxLength(64)
  targetId!: string;

  @IsString() @MinLength(1) @MaxLength(50)
  reason!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  details?: string;
}

class CreateBlockDto {
  @IsUUID()
  userId!: string;
}

/**
 * Moderation endpoints — report content/users and block/unblock users.
 * All routes require an authenticated user (JWT auth is applied globally
 * via APP_GUARD in app.module.ts).
 */
@Controller({ path: 'social', version: '1' })
export class ModerationController {
  constructor(
    @InjectRepository(UserReport)
    private readonly reportsRepo: Repository<UserReport>,
    @InjectRepository(UserBlock)
    private readonly blocksRepo: Repository<UserBlock>,
    private readonly ds: DataSource,
  ) {}

  private uid(req: Request): string {
    return (req as any).user?.id ?? '';
  }

  /**
   * POST /v1/social/reports
   * Submit a moderation report. UNIQUE(reporter, target_type, target_id) is
   * enforced at the DB level via ON CONFLICT DO NOTHING so the client can
   * safely retry — a duplicate returns 200 with `{ deduped: true }` instead
   * of a 409, avoiding a race in the UI.
   */
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  async createReport(@Req() req: Request, @Body() dto: CreateReportDto) {
    const reporterId = this.uid(req);
    if (!reporterId) throw new BadRequestException('Not authenticated');

    // ON CONFLICT DO NOTHING → RETURNING is empty when the row already
    // existed. Treat that as a successful de-dupe rather than an error.
    const rows: Array<{ id: string; created_at: Date }> = await this.ds.query(
      `INSERT INTO user_reports
         (reporter_id, target_type, target_id, reason, details, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
       RETURNING id, created_at`,
      [
        reporterId,
        dto.targetType,
        dto.targetId,
        dto.reason,
        dto.details ?? null,
      ],
    );

    if (rows.length === 0) {
      return { deduped: true };
    }
    return { id: rows[0].id, createdAt: rows[0].created_at };
  }

  /**
   * POST /v1/social/blocks
   * Block another user. Idempotent — blocking a user you already blocked
   * is a no-op. Callers cannot block themselves (DB CHECK constraint plus
   * a friendly 400 here).
   */
  @Post('blocks')
  @HttpCode(HttpStatus.CREATED)
  async createBlock(@Req() req: Request, @Body() dto: CreateBlockDto) {
    const blockerId = this.uid(req);
    if (!blockerId) throw new BadRequestException('Not authenticated');
    if (blockerId === dto.userId) {
      throw new BadRequestException('You cannot block yourself');
    }
    await this.ds.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, dto.userId],
    );
    return { blocked: dto.userId };
  }

  /**
   * DELETE /v1/social/blocks/:userId
   * Unblock a user. Idempotent — deleting a non-existent block is a no-op.
   */
  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBlock(
    @Req() req: Request,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const blockerId = this.uid(req);
    if (!blockerId) throw new BadRequestException('Not authenticated');
    await this.blocksRepo.delete({ blockerId, blockedId: userId });
  }

  /**
   * GET /v1/social/blocks
   * List the caller's active blocks. Returns { blocked: [userId, ...] }.
   */
  @Get('blocks')
  async listBlocks(@Req() req: Request): Promise<{ blocked: string[] }> {
    const blockerId = this.uid(req);
    if (!blockerId) throw new BadRequestException('Not authenticated');
    const rows = await this.blocksRepo.find({
      where: { blockerId },
      select: ['blockedId'],
    });
    return { blocked: rows.map((r) => r.blockedId) };
  }
}
