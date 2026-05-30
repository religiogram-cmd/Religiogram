import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { VerificationReviewQueue, QueueStatus } from "../verification/entities/verification-review-queue.entity";
import { VerificationSubmission } from "../verification/entities/verification-submission.entity";
import { ProviderEntity, ProviderStatus } from "../service-providers/entities/provider.entity";
import { AdminAuditService } from "./admin-audit.service";
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/verification', version: '1' })
export class AdminVerificationController {
  constructor(
    @InjectRepository(VerificationReviewQueue)
    private readonly queueRepo: Repository<VerificationReviewQueue>,
    @InjectRepository(VerificationSubmission)
    private readonly submissionRepo: Repository<VerificationSubmission>,
    private readonly audit: AdminAuditService,
    private readonly dataSource: DataSource,
  ) {}

  @Get("queue")
  async listQueue(
    @Query("status") status?: QueueStatus,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = { queueStatus: status ?? QueueStatus.PENDING };
    const [data, total] = await this.queueRepo.findAndCount({
      where,
      order: { submittedAt: "ASC" },
      skip,
      take: Number(limit),
    });
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  @Get("queue/:id")
  async getQueueItem(@Param("id", ParseUUIDPipe) id: string) {
    const item = await this.queueRepo.findOneOrFail({ where: { id } });
    const submissions = await this.submissionRepo.find({
      where: { providerId: item.providerId },
      order: { submittedAt: "DESC" },
      take: 20,
      relations: ['documents', 'notes'],
    });
    return { item, submissions };
  }

  @Patch("queue/:id/assign")
  @HttpCode(HttpStatus.OK)
  async assignReviewer(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { reviewerId: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    await this.queueRepo.update(id, {
      queueStatus: QueueStatus.IN_REVIEW,
      assignedAdminId: dto.reviewerId,
    } as Partial<VerificationReviewQueue>);
    await this.audit.log({ adminId: me.id, actionType: "verification.assign", targetType: "verification_queue", targetId: id, justification: `assigned to ${dto.reviewerId}` });
    return { success: true, queueId: id };
  }

  @Patch("queue/:id/approve")
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { reviewNote?: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    await this.queueRepo.update(id, {
      queueStatus: QueueStatus.APPROVED,
      reviewedAt: new Date(),
      notes: dto.reviewNote ?? null,
    } as Partial<VerificationReviewQueue>);
    // Update provider status to approved
    const item = await this.queueRepo.findOneOrFail({ where: { id } });
    await this.dataSource.getRepository(ProviderEntity).update(
      { id: item.providerId },
      { status: ProviderStatus.Approved, providerState: 'approved', approvedAt: new Date() },
    );
    await this.audit.log({ adminId: me.id, actionType: "verification.approve", targetType: "verification_queue", targetId: id, justification: dto.reviewNote ?? "approved" });
    return { success: true, queueId: id };
  }

  @Patch("queue/:id/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { reason: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    await this.queueRepo.update(id, {
      queueStatus: QueueStatus.REJECTED,
      reviewedAt: new Date(),
      notes: dto.reason,
    } as Partial<VerificationReviewQueue>);
    await this.audit.log({ adminId: me.id, actionType: "verification.reject", targetType: "verification_queue", targetId: id, justification: dto.reason });
    return { success: true, queueId: id };
  }
}