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
  Req,
  Res,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ProviderEntity,
  ProviderStatus,
} from '../service-providers/entities/provider.entity';
import {
  KycVideoEntity,
  KycStatus,
} from '../service-providers/entities/kyc-video.entity';
import { ProviderBankAccount } from '../service-providers/entities/provider-bank-account.entity';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AdminActionLog } from './entities/admin-action-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * AdminProviderVerificationController
 *
 * GET  /v1/admin/verifications/queue
 * GET  /v1/admin/verifications/:providerId/file/:kind
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
  private readonly logger = new Logger(AdminProviderVerificationController.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(KycVideoEntity)
    private readonly kycVideos: Repository<KycVideoEntity>,
    @InjectRepository(AdminActionLog)
    private readonly actionLog: Repository<AdminActionLog>,
    @InjectRepository(ProviderBankAccount)
    private readonly bankAccounts: Repository<ProviderBankAccount>,
    private readonly notifs: NotificationsService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('storage.region', 'ap-south-1'),
      endpoint: this.config.get<string>('storage.endpoint'),
      credentials: {
        accessKeyId: this.config.get<string>('storage.accessKeyId', ''),
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
    const take = Math.min(200, parseInt(limit, 10) || 50);
    const skip = parseInt(offset, 10) || 0;

    const [items, total] = await this.providers.findAndCount({
      where: { status: status as ProviderStatus },
      order: { updatedAt: 'ASC' },
      skip,
      take,
      select: [
        'id',
        'userId',
        'fullName',
        'religion',
        'city',
        'status',
        'updatedAt',
        'createdAt',
      ],
    });

    return { items, total };
  }

  /* ─── GET /v1/admin/verifications/:providerId/file/:kind ───
   * Streams the requested KYC document (pan | selfie | video-N)
   * through the backend so the admin frontend can fetch as a blob
   * with Bearer auth. Avoids signed-URL CORS/SW issues entirely.   */
  @Get('verifications/:providerId/file/:kind')
  async streamFile(
    @Param('providerId') providerId: string,
    @Param('kind') kind: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = await this.providers.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    let key: string | null = null;
    let contentType = 'application/octet-stream';

    if (kind === 'pan') {
      key = provider.panS3Key;
      contentType = 'image/jpeg';
    } else if (kind === 'selfie') {
      key = provider.selfieS3Key;
      contentType = 'image/jpeg';
    } else if (kind.startsWith('video-')) {
      const videoIdx = parseInt(kind.replace('video-', ''), 10);
      const videos = await this.kycVideos.find({
        where: { providerId },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      key = videos[videoIdx]?.s3Key ?? null;
      contentType = videos[videoIdx]?.mimeType ?? 'video/mp4';
    }

    if (!key) throw new NotFoundException(`No ${kind} file uploaded`);

    try {
      const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const out = await this.s3.send(cmd);
      res.setHeader('Content-Type', out.ContentType ?? contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      if (out.ContentLength) {
        res.setHeader('Content-Length', String(out.ContentLength));
      }
      if (out.Body) {
        // @ts-ignore — Body is a Node stream in the AWS SDK runtime
        out.Body.pipe(res);
      } else {
        res.status(204).end();
      }
    } catch (err: any) {
      this.logger.error(
        `[admin] streamFile failed kind=${kind} key=${key} err=${err?.message}`,
      );
      throw new NotFoundException(
        `File not retrievable: ${err?.message ?? 'unknown'}`,
      );
    }
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

    const signKey = async (key: string | null): Promise<string | null> => {
      if (!key) return null;
      try {
        const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
        return await getSignedUrl(this.s3, cmd, { expiresIn: 86_400 });
      } catch {
        return null;
      }
    };

    const kycVideosOut = await Promise.all(
      videos.map(async (v) => ({
        id: v.id,
        r2ObjectKey: v.s3Key,
        signedUrl: await signKey(v.s3Key),
        durationSeconds: v.durationSeconds,
        status: v.status,
        rejectionReason: v.rejectionReason,
        createdAt: v.createdAt,
      })),
    );

    const [panSignedUrl, selfieSignedUrl] = await Promise.all([
      signKey(provider.panS3Key),
      signKey(provider.selfieS3Key),
    ]);

    this.logger.log(
      `[admin] bucket=${this.bucket} PAN key=${provider.panS3Key} signedUrl=${panSignedUrl?.substring(0, 80) ?? 'null'}`,
    );
    this.logger.log(
      `[admin] bucket=${this.bucket} Selfie key=${provider.selfieS3Key} signedUrl=${selfieSignedUrl?.substring(0, 80) ?? 'null'}`,
    );

    const bankRow = await this.bankAccounts.findOne({
      where: { providerId, isPrimary: true },
    });

    let bankOut:
      | {
          bankName: string | null;
          ifscCode: string | null;
          upiId: string | null;
          beneficiaryName: string | null;
          masked: string;
          verificationStatus: string;
        }
      | null = null;

    if (bankRow) {
      let masked = '****';
      if (bankRow.upiId) {
        masked = `****${bankRow.upiId.replace(/^[^@]+/, '')}`;
      } else {
        try {
          const pt = this.encryption.decrypt(
            bankRow.accountNumberEncrypted,
            'PAYOUT_ENCRYPTION_KEY',
          );
          masked = `****${pt.slice(-4)}`;
        } catch {
          masked = '****';
        }
      }
      bankOut = {
        bankName: bankRow.bankName ?? null,
        ifscCode: bankRow.ifscCode ?? null,
        upiId: bankRow.upiId ?? null,
        beneficiaryName: bankRow.beneficiaryName ?? null,
        masked,
        verificationStatus: bankRow.verificationStatus,
      };
    }

    return {
      provider,
      kycVideos: kycVideosOut,
      panSignedUrl,
      selfieSignedUrl,
      bank: bankOut,
    };
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

    await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Approved, approvedAt: new Date() },
    );

    await this.logAction({
      adminId: me.id,
      actionType: 'provider.approve',
      targetId: providerId,
      notes: body.notes ?? 'Approved',
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

    await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Rejected, rejectionReason: body.reason },
    );

    await this.logAction({
      adminId: me.id,
      actionType: 'provider.reject',
      targetId: providerId,
      notes: body.reason,
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
      adminId: me.id,
      actionType: 'provider.request_info',
      targetId: providerId,
      notes: body.whatToFix,
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

    await this.providers.update(
      { id: providerId },
      { status: ProviderStatus.Suspended },
    );

    await this.logAction({
      adminId: me.id,
      actionType: 'provider.suspend',
      targetId: providerId,
      notes: body.reason,
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

    await this.providers.update(
      { id: providerId },
      {
        status: ProviderStatus.Approved,
        approvedAt: provider.approvedAt ?? new Date(),
      },
    );

    await this.logAction({
      adminId: me.id,
      actionType: 'provider.reinstate',
      targetId: providerId,
      notes: 'Reinstated by admin',
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

    await this.providers.update(
      { id: providerId },
      {
        status: ProviderStatus.Rejected,
        rejectionReason: `BLOCKED: ${body.reason}`,
      },
    );

    await this.logAction({
      adminId: me.id,
      actionType: 'provider.block',
      targetId: providerId,
      notes: body.reason,
    });

    await this.notifs.send(
      provider.userId,
      NotificationType.SYSTEM,
      'Account blocked',
      `Your provider account has been blocked. Reason: ${body.reason}. Contact support for assistance.`,
    );

    return { providerState: ProviderStatus.Rejected };
  }

  /* ─── Internal: SLA alert cron (hourly) ─── */
  @Cron(CronExpression.EVERY_HOUR)
  async checkKycSlaBreach(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const stale = await this.kycVideos.count({
      where: {
        status: KycStatus.PendingReview,
        createdAt: LessThan(cutoff),
      },
    });

    if (stale === 0) return;

    this.logger.warn(
      `KYC SLA BREACH: ${stale} submission(s) pending > 48 hours`,
    );

    const webhookUrl = this.config.get<string>('slack.webhookUrl', '');
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `ReligioGram KYC SLA Alert: ${stale} provider submission(s) have been waiting more than 48 hours for review. Please action them now.`,
        }),
      });
    } catch (e) {
      this.logger.error('Failed to send Slack SLA alert', e as any);
    }
  }

  /* ─── Private helpers ─── */
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
      adminId: params.adminId,
      actionType: params.actionType,
      targetType: 'provider',
      targetId: params.targetId,
      payloadJson: { notes: params.notes },
    } as any);
    await this.actionLog.save(log);
  }
}
