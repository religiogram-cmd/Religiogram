// v9 (P0-1 fix): Imports for @CurrentUser + AuthenticatedUser were missing in v7/v8,
// causing this file to fail `tsc --noEmit`. Imports added and parameter signatures
// reformatted. DTOs no longer accept body-supplied adminId — admin identity is
// derived exclusively from req.user.id via the JWT guard.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { EntryType, LedgerEntry } from '../wallet/entities/ledger-entry.entity';
import { WalletBalance } from '../wallet/entities/wallet-balance.entity';
import { Wallet, WalletStatus } from '../wallet/entities/wallet.entity';
import { AdminAuditService } from './admin-audit.service';

// v9 (P0-1 fix): DTOs scrubbed of `adminId` — the field was never read by the
// handler (req.user.id is the source of truth) but accepting it in the request
// body misled callers and gave operators a false sense that the API "supports"
// admin impersonation. Validation is now strict.
class FreezeWalletDto {
  @IsString() @MinLength(4) @MaxLength(500)
  reason!: string;
}

class CreditWalletDto {
  @IsInt() @Min(1)
  amountPaise!: number;

  @IsString() @MinLength(4) @MaxLength(500)
  justification!: string;

  /** Caller MUST supply a stable key so retries are idempotent.
   *  Example: `admin-credit:<adminId>:<userId>:<reason>:<timestamp>` */
  @IsString() @MinLength(8) @MaxLength(128)
  idempotencyKey!: string;
}

class ForceRefundDto {
  @IsInt() @Min(1)
  amountPaise!: number;

  @IsUUID()
  referenceId!: string;

  @IsString() @MinLength(4) @MaxLength(500)
  reason!: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/wallets', version: '1' })
export class AdminWalletController {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(WalletBalance)
    private readonly walletBalanceRepo: Repository<WalletBalance>,
    private readonly ds: DataSource,
    private readonly audit: AdminAuditService,
  ) {}

  @Get(':ownerId')
  async getWallet(@Param('ownerId', ParseUUIDPipe) ownerId: string) {
    const wallet = await this.walletRepo.findOne({ where: { ownerId } });
    if (!wallet) return { ownerId, availableBalance: 0, status: 'not_found' };
    return wallet;
  }

  @Get(':ownerId/ledger')
  async getLedger(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Number(limit) || 50, 200);
    const skip = (safePage - 1) * safeLimit;
    const wallet = await this.walletRepo.findOne({ where: { ownerId } });
    if (!wallet) return { data: [], total: 0 };
    const [data, total] = await this.ledgerRepo.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });
    return { data, total };
  }

  @Post(':ownerId/freeze')
  @HttpCode(HttpStatus.OK)
  async freeze(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() dto: FreezeWalletDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const freezeResult = await this.walletRepo.update({ ownerId }, { status: WalletStatus.FROZEN });
    if (freezeResult.affected === 0) throw new NotFoundException(`Wallet for owner ${ownerId} not found`);
    await this.audit.log({
      adminId: me.id,
      actionType: 'wallet.freeze',
      targetType: 'wallet',
      targetId: ownerId,
      justification: dto.reason,
    });
    return { success: true, ownerId, status: WalletStatus.FROZEN };
  }

  @Post(':ownerId/unfreeze')
  @HttpCode(HttpStatus.OK)
  async unfreeze(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() dto: FreezeWalletDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    const unfreezeResult = await this.walletRepo.update({ ownerId }, { status: WalletStatus.ACTIVE });
    if (unfreezeResult.affected === 0) throw new NotFoundException(`Wallet for owner ${ownerId} not found`);
    await this.audit.log({
      adminId: me.id,
      actionType: 'wallet.unfreeze',
      targetType: 'wallet',
      targetId: ownerId,
      justification: dto.reason,
    });
    return { success: true, ownerId, status: WalletStatus.ACTIVE };
  }

  @Post(':ownerId/credit')
  @HttpCode(HttpStatus.OK)
  async adminCredit(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() dto: CreditWalletDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    // v10: idempotency key is caller-supplied so retries are truly idempotent.
    // The caller must include a stable, unique key per intended credit event.
    const idempotencyKey = `admin-credit:${dto.idempotencyKey}`;

    await this.ds.transaction(async (em: EntityManager) => {
      const wallet = await em.createQueryBuilder(Wallet, 'w')
        .setLock('pessimistic_write')
        .where('w.owner_id = :ownerId', { ownerId })
        .getOneOrFail();
      const newBalance = Number(wallet.availableBalance) + dto.amountPaise;
      await em.update(Wallet, wallet.id, { availableBalance: newBalance });
      await em.insert(LedgerEntry, {
        walletId: wallet.id,
        entryType: EntryType.CREDIT,
        amount: dto.amountPaise,
        direction: 1 as const,
        balanceAfter: newBalance,
        referenceType: 'admin_credit',
        referenceId: me.id,
        description: dto.justification,
        idempotencyKey,
      });
      // Sync WalletBalance ledger table
      await em.upsert(WalletBalance, { walletId: wallet.id, available: newBalance }, ['walletId']);
    });
    await this.audit.log({
      adminId: me.id,
      actionType: 'wallet.admin_credit',
      targetType: 'wallet',
      targetId: ownerId,
      justification: `${dto.amountPaise} paise - ${dto.justification}`,
    });
    return { success: true, amountPaise: dto.amountPaise };
  }

  @Post(':ownerId/force-refund')
  @HttpCode(HttpStatus.OK)
  async forceRefund(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() dto: ForceRefundDto,
    @CurrentUser() me: AuthenticatedUser,
  ) {
    // v9: idempotency key bound to (admin, referenceId, amount). Re-firing the
    // same refund for the same reference is collapsed; admin must change the
    // amount or reference to issue a new ledger row.
    const idempotencyKey = `admin-refund:${me.id}:${dto.referenceId}:${dto.amountPaise}`;

    await this.ds.transaction(async (em: EntityManager) => {
      const wallet = await em.createQueryBuilder(Wallet, 'w')
        .setLock('pessimistic_write')
        .where('w.owner_id = :ownerId', { ownerId })
        .getOneOrFail();
      const newBalance = Number(wallet.availableBalance) + dto.amountPaise;
      await em.update(Wallet, wallet.id, { availableBalance: newBalance });
      await em.insert(LedgerEntry, {
        walletId: wallet.id,
        entryType: EntryType.REFUND,
        amount: dto.amountPaise,
        direction: 1 as const,
        balanceAfter: newBalance,
        referenceType: 'admin_refund',
        referenceId: dto.referenceId,
        description: dto.reason,
        idempotencyKey,
      });
      // Sync WalletBalance ledger table
      await em.upsert(WalletBalance, { walletId: wallet.id, available: newBalance }, ['walletId']);
    });
    await this.audit.log({
      adminId: me.id,
      actionType: 'wallet.force_refund',
      targetType: 'wallet',
      targetId: ownerId,
      justification: `${dto.amountPaise} paise - ${dto.reason}`,
    });
    return { success: true, refundedPaise: dto.amountPaise };
  }
}
