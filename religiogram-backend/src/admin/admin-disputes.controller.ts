
import {
  Controller,
  Get,
  NotFoundException,
  BadRequestException,
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
import { Repository } from "typeorm";
import { Dispute, DisputeStatus } from "../dispute/entities/dispute.entity";
import { WalletService } from "../wallet/wallet.service";
import { AdminAuditService } from "./admin-audit.service";
import { DisputeService } from "../dispute/dispute.service";
import { encodeCursor, decodeCursor } from '../common/pagination/cursor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

class AssignDisputeDto { assigneeId!: string; }
class ResolveDisputeDto {
  resolution!: "resolved_for_user" | "resolved_for_provider" | "closed";
  resolutionNote!: string;
  refundAmountPaise?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/disputes', version: '1' })
export class AdminDisputesController {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    private readonly audit: AdminAuditService,
    private readonly walletService: WalletService,
    private readonly disputeService: DisputeService,
  ) {}

  @Get()
  async list(
    @Query("status") status?: DisputeStatus,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = 20,
  ) {
    // P1-14 (v5): keyset pagination.
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const qb = this.disputeRepo.createQueryBuilder('d')
      .orderBy('d.slaDeadline', 'ASC')
      .addOrderBy('d.id', 'ASC')
      .take(safeLimit + 1);
    if (status) qb.andWhere('d.status = :status', { status });
    if (cursor) {
      const { d: cd, i } = decodeCursor(cursor);
      qb.andWhere('(d.slaDeadline > :cd OR (d.slaDeadline = :cd AND d.id > :i))', { cd, i });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();
    const last = rows[rows.length - 1];
    return {
      data: rows,
      nextCursor: hasMore && last ? encodeCursor(last.slaDeadline, String(last.id)) : null,
    };
  }

  @Get(":id")
  async getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.disputeRepo.findOneOrFail({ where: { id } });
  }

  @Patch(":id/assign")
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignDisputeDto,
  @CurrentUser() me: AuthenticatedUser)  {
    const assignResult = await this.disputeRepo.update(id, {
      status: DisputeStatus.UNDER_INVESTIGATION,
      resolvedById: dto.assigneeId,
    });
    if (assignResult.affected === 0) throw new NotFoundException(`Dispute ${id} not found`);
    await this.audit.log({ adminId: me.id /* P1-6 v5: forced from req.user */, actionType: "dispute.assign", targetType: "dispute", targetId: id, justification: `assigned to ${dto.assigneeId}` });
    return { success: true, disputeId: id, assignedTo: dto.assigneeId };
  }

  @Patch(":id/resolve")
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  @CurrentUser() me: AuthenticatedUser)  {
    // Route through DisputeService state machine — never update repo directly.
    // DisputeService enforces valid transitions and handles wallet credits atomically.
    if (dto.resolution === 'resolved_for_user') {
      if (dto.refundAmountPaise) {
        const disputeForCap = await this.disputeService.findById(id);
        const maxRefund = (disputeForCap as any).booking?.amountPaise ?? 0;
        if (dto.refundAmountPaise > maxRefund) {
          throw new BadRequestException(`Refund amount (${dto.refundAmountPaise}) cannot exceed booking amount (${maxRefund})`);
        }
      }
      await this.disputeService.resolveForUser(id, me.id, {
        note: dto.resolutionNote,
        refundAmountPaise: dto.refundAmountPaise ?? 0,
      });
    } else if (dto.resolution === 'resolved_for_provider') {
      await this.disputeService.resolveForProvider(id, me.id, { note: dto.resolutionNote });
    } else {
      // closed — update repo directly since DisputeService has no close() method
      const closeResult = await this.disputeRepo.update(id, {
        status: DisputeStatus.CLOSED,
        resolvedById: me.id,
        resolutionNote: dto.resolutionNote,
        resolvedAt: new Date(),
      });
      if (closeResult.affected === 0) throw new NotFoundException(`Dispute ${id} not found`);
    }

    await this.audit.log({ adminId: me.id /* P1-6 v5: forced from req.user */, actionType: `dispute.${dto.resolution}`, targetType: "dispute", targetId: id, justification: dto.resolutionNote });
    return { success: true, disputeId: id, resolution: dto.resolution };
  }

  @Patch(":id/escalate")
  @HttpCode(HttpStatus.OK)
  async escalate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { escalationNote: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const escalateResult = await this.disputeRepo.update(id, { status: DisputeStatus.ESCALATED });
    if (escalateResult.affected === 0) throw new NotFoundException(`Dispute ${id} not found`);
    await this.audit.log({ adminId: me.id, actionType: "dispute.escalate", targetType: "dispute", targetId: id, justification: dto.escalationNote });
    return { success: true, disputeId: id };
  }
}
