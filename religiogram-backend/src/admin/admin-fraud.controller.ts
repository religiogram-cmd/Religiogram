
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
import { Repository } from "typeorm";
import { FraudSignal } from "../fraud/entities/fraud-signal.entity";
import { AdminAuditService } from "./admin-audit.service";
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/fraud', version: '1' })
export class AdminFraudController {
  constructor(
    @InjectRepository(FraudSignal)
    private readonly fraudRepo: Repository<FraudSignal>,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  async list(
    @Query("resolved") resolved?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const where: Record<string, unknown> = {};
    if (resolved !== undefined) where["isResolved"] = resolved === "true";
    const [data, total] = await this.fraudRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip,
      take: Number(limit),
    });
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  @Get(":id")
  async getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.fraudRepo.findOneOrFail({ where: { id } });
  }

  @Patch(":id/override")
  @HttpCode(HttpStatus.OK)
  async override(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: { verdict: "false_positive" | "confirmed"; overrideNote: string },
    @CurrentUser() me: AuthenticatedUser,
  ) {
    await this.fraudRepo.update(id, {
      isResolved: true,
      resolvedById: me.id,
    });
    await this.audit.log({
      adminId: me.id /* P1-6 v5: forced from req.user */,
      actionType: `fraud.override.${dto.verdict}`,
      targetType: "fraud_signal",
      targetId: id,
      justification: dto.overrideNote,
    });
    return { success: true, signalId: id, verdict: dto.verdict };
  }
}
