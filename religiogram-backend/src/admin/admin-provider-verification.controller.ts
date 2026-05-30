import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Logger,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ProviderEntity,
  ProviderStatus,
} from '../service-providers/entities/provider.entity';
import { KycVideoEntity } from '../service-providers/entities/kyc-video.entity';
import { AdminActionLog } from './entities/admin-action-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * AdminProviderVerificationController
 *
 * GET  /v1/admin/verifications/queue
 * GET  /v1/admin/verifications/:providerId
 * POST /v1/admin/verifications/:providerId/approve
 * POST /v1/admin/verifications/:providerId/reject
 * POST /v1/admin/verifications/:providerId/request_info
 * POST /v1/admin/providers/:providerId/suspend
 * POST /v1/admin/providers/:providerId/reinstate
 * POST /v1/admin/providers/:providerId/block
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin', version: '1' })
export class AdminProviderVerificationController {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(KycVideoEntity)
    private readonly kycVideos: Repository<KycVideoEntity>,
    @InjectRepository(AdminActionLog)
    private readonly actionLog: Repository<AdminActionLog>,
    private readonly notifs: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region:   this.config.get<string>('storage.region', 'ap-south-1'),
      endpoint: this.config.get<string>('storage.endpoint'),
      credentials: {
        accessKeyId:     this.config.get<string>('storage.accessKeyId', ''),
        secretAccessKey: this.config.get<string>('storage.secretAccessKey', ''),
      },
    });
    this.bucket = this.config.get<string>('storage.bucket', 'religiogram-dev');
  }

  /* ─── GET /v1/admin/verifications/queue ─── */
  @Get('verifications/queue')
  async queue(
    @Query('status') status = 'pending_review',
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const take = Math.min(200, parseInt(limit, 10));
    const skip = parseInt(offset, 10);

    const [items, total] = await this.providers.findAndCount({
      where: { status: status as ProviderStatus },
      order: { updatedAt: 'ASC' },
      skip,
      take,
      select: ['id', 'userId', 'fullName', 'religion', 'city', 'status', 'updatedAt', 'createdAt'],
    });

    return { items, total };
  }

  /* ─── GET /v1/admin/verifications/:providerId ─── */
  @Get('verifications/:providerId')
  async getVerification(@Param('providerId') providerId: string) {
    const provider = await this.providers.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const videos = await this.kycVideos.find({
      where: { providerId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    // Generate signed R2/S3 URLs valid for 24 hours
    const kycVideosOut = await Promise.all(
      videos.map(async (v) => {
        let signedUrl: string | null = null;
        try {
          const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: v.s3Key });
          signedUrl = await getSignedUrl(this.s3, cmd, { expiresIn: 86_400 });
        } catch (_) {
          // non-fatal: return null URL if signing fails
        }
        return {
          id:              v.id,
          r2ObjectKey:     v.s3Key,
          signedUrl,
          durationSeconds: v.durationSeconds,
          status:          v.status,
          rejectionReason: v.rejectionReason,
          createdAt:       v.createdAt,
        };
      }),
    );

    return { provider, kycVideos: kycVideosOut };
  }

  /* ─── POST /v1/admin/verifications/:providerId/approve ─── */
  @Post('verifications/:providerId/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('providerId') providerId: string,
    @Body() body: { notes?: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const provider = await this.mustFind(providerId);

    const approveResult = await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Approved, approvedAt: new Date() },
    );
    if (approveResult.affected === 0) throw new NotFoundException(`Provider ${providerId} not found`);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.approve',
      targetId:   providerId,
      notes:      body.notes ?? 'Approved',
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Application approved!',
      'Congratulations! Your provider application has been approved. You are now live on ReligioGram.',
    );

    return { providerState: ProviderStatus.Approved };
  }

  /* ─── POST /v1/admin/verifications/:providerId/reject ─── */
  @Post('verifications/:providerId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('providerId') providerId: string,
    @Body() body: { reason: string; notes?: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (!body.reason) throw new BadRequestException('reason is required');
    const provider = await this.mustFind(providerId);

    const rejectResult = await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Rejected, rejectionReason: body.reason },
    );
    if (rejectResult.affected === 0) throw new NotFoundException(`Provider ${providerId} not found`);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.reject',
      targetId:   providerId,
      notes:      body.reason,
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Application not approved',
      `Your provider application was not approved. Reason: ${body.reason}. You may re-apply after addressing the issues.`,
    );

    return { providerState: ProviderStatus.Rejected };
  }

  /* ─── POST /v1/admin/verifications/:providerId/request_info ─── */
  @Post('verifications/:providerId/request_info')
  @HttpCode(HttpStatus.OK)
  async requestInfo(
    @Param('providerId') providerId: string,
    @Body() body: { whatToFix: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (!body.whatToFix) throw new BadRequestException('whatToFix is required');
    const provider = await this.mustFind(providerId);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.request_info',
      targetId:   providerId,
      notes:      body.whatToFix,
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Additional information required',
      `Please update your profile: ${body.whatToFix}`,
    );

    return { providerState: ProviderStatus.PendingReview };
  }

  /* ─── POST /v1/admin/providers/:providerId/suspend ─── */
  @Post('providers/:providerId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('providerId') providerId: string,
    @Body() body: { reason: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (!body.reason) throw new BadRequestException('reason is required');
    const provider = await this.mustFind(providerId);

    const suspendResult = await this.providers.update({ id: providerId }, { status: ProviderStatus.Suspended });
    if (suspendResult.affected === 0) throw new NotFoundException(`Provider ${providerId} not found`);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.suspend',
      targetId:   providerId,
      notes:      body.reason,
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Account suspended',
      `Your provider account has been suspended. Reason: ${body.reason}. Contact support for assistance.`,
    );

    return { providerState: ProviderStatus.Suspended };
  }

  /* ─── POST /v1/admin/providers/:providerId/reinstate ─── */
  @Post('providers/:providerId/reinstate')
  @HttpCode(HttpStatus.OK)
  async reinstate(
    @Param('providerId') providerId: string,
    @Body() body: { adminId?: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const provider = await this.mustFind(providerId);

    const reinstateResult = await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Approved, approvedAt: provider.approvedAt ?? new Date() },
    );
    if (reinstateResult.affected === 0) throw new NotFoundException(`Provider ${providerId} not found`);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.reinstate',
      targetId:   providerId,
      notes:      'Reinstated by admin',
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Account reinstated',
      'Your provider account has been reinstated. You are live on ReligioGram again.',
    );

    return { providerState: ProviderStatus.Approved };
  }

  /* ─── POST /v1/admin/providers/:providerId/block ─── */
  @Post('providers/:providerId/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @Param('providerId') providerId: string,
    @Body() body: { reason: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (!body.reason) throw new BadRequestException('reason is required');
    const provider = await this.mustFind(providerId);

    // Store block as Rejected with a BLOCKED prefix in rejection_reason
    const blockResult = await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Rejected, rejectionReason: `BLOCKED: ${body.reason}` },
    );
    if (blockResult.affected === 0) throw new NotFoundException(`Provider ${providerId} not found`);

    await this.logAction({
      adminId:    me.id,
      actionType: 'provider.block',
      targetId:   providerId,
      notes:      body.reason,
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Account blocked',
      'Your provider account has been permanently blocked due to policy violations.',
    );

    return { providerState: 'blocked' };
  }

  /* ── helpers ── */
  private async mustFind(providerId: string): Promise<ProviderEntity> {
    const p = await this.providers.findOne({ where: { id: providerId } });
    if (!p) throw new NotFoundException('Provider not found');
    return p;
  }

  private async logAction(params: {
    adminId: string;
    actionType: string;
    targetId: string;
    notes: string;
  }): Promise<void> {
    const log = this.actionLog.create({
      adminId:    params.adminId,
      actionType: params.actionType,
      targetType: 'provider',
      targetId:   params.targetId,
      payloadJson: { notes: params.notes },
    } as any);
    await this.actionLog.save(log);
  }

  private readonly logger = new Logger(AdminProviderVerificationController.name);

  /**
   * Runs every hour — fires a log warning (+ Slack webhook if configured)
   * for any KYC submission that has been waiting more than 48 hours.
   * §6.4 acceptance: "Admin gets a Slack/email alert if any submission
   * ages past 48 hours."
   */
  @Cron('0 * * * *')   // every hour
  async checkKycSlaBreaches(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const stale = await this.kycVideos
      .createQueryBuilder('k')
      .where('k.review_decision IS NULL')
      .andWhere('k.created_at < :cutoff', { cutoff })
      .getCount();

    if (stale === 0) return;

    this.logger.warn(`KYC SLA BREACH: ${stale} submission(s) pending > 48 hours`);

    const webhookUrl = this.config.get<string>('slack.webhookUrl', '');
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 *ReligioGram KYC SLA Alert*: ${stale} provider submission(s) have been waiting more than 48 hours for review. Please action them now.`,
          }),
        });
      } catch (e) {
        this.logger.error('Failed to send Slack SLA alert', e);
      }
    }
  }

}