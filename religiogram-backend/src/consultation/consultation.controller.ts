import {
  Controller, ForbiddenException, Get, Post, NotFoundException, Param,
  ParseUUIDPipe, Query, Req, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationSession } from './entities/consultation-session.entity';
import { ConsultationIntroService } from './consultation-intro.service';
import { TurnCredentialsService } from './turn-credentials.service'; // v9 (P0-3)
import { IsInt, IsOptional, IsString, Min, MinLength , MaxLength } from 'class-validator';

class StartSessionDto {
  @IsString()
  providerId!: string;

  @IsOptional()
  @IsString()
  planType?: string;
}

class ExtendSessionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  extendMinutes?: number;

  @IsOptional()
  @IsString()
  upgradePlan?: 'pack_20' | 'pack_30' | 'per_minute';

  /**
   * Client-supplied idempotency key for the hold operation.
   * Required when calling from a retrying client (e.g., after network timeout).
   * Max 64 chars.  If omitted, a UUID is generated server-side (non-idempotent).
   */
  @IsOptional()
  @IsString()
  @MinLength(1)        // disallow empty string — 'ext-' key collision
  @MaxLength(64)
  idempotencyKey?: string;
}

@ApiTags('consultation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'consultation', version: '1' })
export class ConsultationController {
  constructor(
    @InjectRepository(ConsultationSession)
    private readonly sessionRepo: Repository<ConsultationSession>,
    private readonly introSvc: ConsultationIntroService,
    private readonly turn: TurnCredentialsService, // v9 (P0-3)
  ) {}

  /**
   * v9 (P0-3 fix): time-bound ICE server credentials for WebRTC.
   *
   * Frontend calls this immediately before opening the RTCPeerConnection.
   * Credentials expire in `turn.ttlSeconds` (default 1 hour); long sessions
   * must re-fetch and renegotiate.
   */
  @Get('turn-credentials')
  @ApiOperation({ summary: 'Issue short-lived TURN credentials for WebRTC' })
  async getTurnCredentials(@Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    return this.turn.issueFor(userId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get my consultation session history' })
  async getMySessions(
    @Req() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const userId: string = req.user.sub ?? req.user.userId;
    const safePage  = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const [sessions, total] = await this.sessionRepo.findAndCount({
      where: [{ userId }, { providerId: userId }],
      order: { startedAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return { sessions, total, page: safePage, limit: safeLimit };
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get consultation session details by ID' })
  async getSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    const isParty = session.userId === userId || session.providerId === userId;
    if (!isParty) throw new ForbiddenException('Access denied');
    return session;
  }

  @Get('sessions/:id/summary')
  @ApiOperation({ summary: 'Get cost summary for a completed session' })
  async getSessionSummary(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const userId: string = req.user.sub ?? req.user.userId;
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    const isParty = session.userId === userId || session.providerId === userId;
    if (!isParty) throw new ForbiddenException('Access denied');

    const durationMin = session.durationSeconds ? Math.ceil(session.durationSeconds / 60) : 0;
    return {
      sessionId:       id,
      status:          session.sessionStatus,
      durationMinutes: durationMin,
      durationSeconds: session.durationSeconds ?? 0,
      totalCharged:    session.totalCharge ?? 0,
      ratePerMinute:   session.ratePerMinute ?? 0,
      startedAt:       session.startedAt,
      endedAt:         session.endedAt,
    };
  }

  @Get('providers/:providerId/availability')
  @ApiOperation({ summary: 'Check if a provider is currently online for consultation' })
  async checkAvailability(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return {
      providerId,
      checkAt: new Date().toISOString(),
      note: 'Subscribe to /consultation socket for real-time status',
    };
  }

  /** POST /v1/consultation/start — §8.3 */
  @Post('start')
  async startConsultation(
    @Req() req: any,
    @Body() body: StartSessionDto,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.introSvc.startSession(
      userId,
      body.providerId,
      (body.planType ?? 'intro_5') as import('./consultation-intro.service').PlanType,
    );
  }

  /** POST /v1/consultation/:id/extend — §8.3 */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })  // P2-v35: rate-limit extend to prevent wallet griefing
  @Post(':id/extend')
  async extendConsultation(
    @Req() req: any,
    @Param('id') sessionId: string,
    @Body() body: ExtendSessionDto,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    // Fix: service expects (sessionId, userId, opts). Previously the two ID
    // args were swapped so every extend returned NotFound/Forbidden.
    return this.introSvc.extendSession(sessionId, userId, {
      extendMinutes: body.extendMinutes,
      upgradePlan: body.upgradePlan,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /**
   * POST /v1/consultation/:id/upgrade — legacy path used by the older
   * frontend build. Forwards to the same extendSession handler with the
   * requested `upgradePlan`. Kept as a separate route so existing clients
   * don't break; new clients should call /extend directly.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/upgrade')
  async upgradeConsultation(
    @Req() req: any,
    @Param('id') sessionId: string,
    @Body() body: ExtendSessionDto,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.introSvc.extendSession(sessionId, userId, {
      extendMinutes: body.extendMinutes,
      upgradePlan: body.upgradePlan,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** POST /v1/consultation/:id/end — §8.3 */
  @Post(':id/end')
  async endConsultation(
    @Req() req: any,
    @Param('id') sessionId: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.introSvc.endSession(sessionId, userId);
  }

  /** GET /v1/consultation/:id — live screen reconnect state §8.3 */
  @Get(':id')
  async getConsultation(
    @Req() req: any,
    @Param('id') sessionId: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    // Fix: service expects (sessionId, userId). Args were swapped.
    return this.introSvc.getSession(sessionId, userId);
  }
}
