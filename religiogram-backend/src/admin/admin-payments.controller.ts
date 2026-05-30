import {
  Controller, Get, Post, Body, Query, HttpCode, HttpStatus,
  BadRequestException, Logger, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { RedisService } from '../redis/redis.service';
import { QUEUE } from '../common/queues/queue.constants';
import type { WebhookRetryJobData } from '../payments/webhook-retry.processor';

class ReplayWebhookDto {
  @IsString() event!: string;
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsString() eventId?: string;
}

/**
 * v6 (recovery): admin-payments.controller.ts was truncated in v3.
 * Reconstructed from the audited endpoint contract.
 *
 *   GET  /v1/admin/queues/dlq             list all DLQ entries
 *   GET  /v1/admin/queues/dlq/:queue      filter DLQ by queue name
 *   POST /v1/admin/payments/webhooks/replay  replay a failed webhook event
 */
@ApiTags('admin/payments')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPaymentsController {
  private readonly logger = new Logger(AdminPaymentsController.name);

  constructor(
    private readonly redis: RedisService,
    @InjectQueue(QUEUE.WEBHOOK_RETRY) private readonly retryQueue: Queue<WebhookRetryJobData>,
  ) {}

  @Get('queues/dlq')
  async listDlq(): Promise<Array<{ queue: string; jobId: string }>> {
    const keys = await this.redis.scanKeys('rg:dlq:*');
    return keys.map((k) => {
      const parts = k.split(':');
      return { queue: parts[2] ?? 'unknown', jobId: parts.slice(3).join(':') };
    });
  }

  @Get('queues/dlq/:queue')
  async listDlqByQueue(@Query('queue') queue: string) {
    const keys = await this.redis.scanKeys(`rg:dlq:${queue}:*`);
    return keys.map((k) => ({ queue, jobId: k.split(':').slice(3).join(':') }));
  }

  @Post('payments/webhooks/replay')
  @HttpCode(HttpStatus.ACCEPTED)
  async replayWebhook(
    @Body() dto: ReplayWebhookDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    if (!dto.event) throw new BadRequestException('event is required');
    this.logger.warn(`Admin ${me.id} replaying webhook event=${dto.event} id=${dto.eventId ?? 'gen'}`);
    await this.retryQueue.add('replay', { event: dto.event, payload: dto.payload, eventId: dto.eventId } as WebhookRetryJobData);
    return { queued: true };
  }
}
