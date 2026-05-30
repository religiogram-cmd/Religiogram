import {
  ConflictException, Injectable, NotFoundException,
  BadRequestException, Logger,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Wallet, WalletOwnerType, WalletStatus } from "./entities/wallet.entity";
import { LedgerEntry, EntryType } from "./entities/ledger-entry.entity";
import { WalletBalance } from "./entities/wallet-balance.entity";
import { WalletHold, HoldStatus } from "./entities/wallet-hold.entity";
import { CreditWalletDto } from "./dto/credit-wallet.dto";
import { DebitWalletDto } from "./dto/debit-wallet.dto";

export interface DebitResult {
  success: boolean;
  insufficientFunds?: boolean;
  entry?: LedgerEntry;
  newBalance?: number;
  duplicate?: boolean;
}

export interface WalletBalanceResult {
  available: number;
  held: number;
  total: number;
  exists: boolean;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Wallet)        private wallets: Repository<Wallet>,
    @InjectRepository(LedgerEntry)   private ledger:  Repository<LedgerEntry>,
    @InjectRepository(WalletBalance) private balances: Repository<WalletBalance>,
    @InjectRepository(WalletHold)    private holds:   Repository<WalletHold>,
  ) {}

  async getOrCreate(userId: string): Promise<Wallet> {
    // Atomic upsert — INSERT ... ON CONFLICT DO NOTHING avoids race on concurrent first-login requests.
    // The unique index idx_wallets_owner on (owner_type, owner_id) is the conflict target.
    await this.ds.query(
      `INSERT INTO wallets (id, user_id, owner_type, owner_id, currency, status, available_balance, held_balance, is_locked)
       VALUES (gen_random_uuid(), $1, 'user', $1, 'INR', 'active', 0, 0, false)
       ON CONFLICT (owner_type, owner_id) DO NOTHING`,
      [userId],
    );

    // Always fetch — whether we just inserted or it already existed
    const wallet = await this.wallets.findOneOrFail({ where: { userId } });

    // Ensure wallet_balance row exists (idempotent)
    const bal = await this.balances.findOne({ where: { walletId: wallet.id } });
    if (!bal) {
      await this.balances.save(this.balances.create({ walletId: wallet.id, available: 0, held: 0 }));
    }
    return wallet;
  }

  async getBalance(userId: string): Promise<WalletBalanceResult> {
    // Try userId first (user wallets), then ownerType+ownerId (provider wallets)
    let w = await this.wallets.findOne({ where: { userId } });
    if (!w) {
      w = await this.wallets.findOne({ where: { ownerType: WalletOwnerType.PROVIDER, ownerId: userId } });
    }
    if (!w) return { available: 0, held: 0, total: 0, exists: false };
    const bal = await this.balances.findOne({ where: { walletId: w.id } });
    if (!bal) return { available: 0, held: 0, total: 0, exists: false };
    const available = Number(bal.available);
    const held      = Number(bal.held);
    return { available, held, total: available + held, exists: true };
  }

  private assertWalletWritable(wallet: Wallet): void {
    if (wallet.status !== WalletStatus.ACTIVE || wallet.isLocked) {
      throw new BadRequestException(
        `Wallet ${wallet.id} is not writable (status=${wallet.status}, isLocked=${wallet.isLocked})`,
      );
    }
  }

  async credit(userId: string, dto: CreditWalletDto): Promise<LedgerEntry> {
    const wallet = await this.getOrCreate(userId);
    this.assertWalletWritable(wallet);

    const earlyExisting = await this.ledger.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (earlyExisting) return earlyExisting;

    return this.ds.transaction(async (em: import('typeorm').EntityManager) => {
      // Lock the wallet row for the duration of the transaction (PgBouncer-safe)
      const lockedWallet = await em.getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId', { userId })
        .getOne();
      if (!lockedWallet) throw new NotFoundException('Wallet not found');

      const existing = await em.findOne(LedgerEntry, {
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: lockedWallet.id } });
      const newBal = Number(bal.available) + dto.amount;

      const entry = em.create(LedgerEntry, {
        walletId: lockedWallet.id,
        entryType: dto.referenceType === "refund" ? EntryType.REFUND : EntryType.CREDIT,
        amount: dto.amount,
        direction: 1,
        balanceAfter: newBal,
        referenceId: dto.referenceId,
        referenceType: dto.referenceType,
        idempotencyKey: dto.idempotencyKey,
        description: dto.description,
      });
      await em.save(entry);
      await em.update(WalletBalance, { walletId: lockedWallet.id }, { available: newBal });
      await em.update(Wallet, { id: lockedWallet.id }, { availableBalance: newBal });
      return entry;
    });
  }

  async debit(userId: string, dto: DebitWalletDto): Promise<DebitResult> {
    const wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet) return { success: false, insufficientFunds: true };
    this.assertWalletWritable(wallet);

    const earlyExisting = await this.ledger.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (earlyExisting) {
      // Early idempotency return — don't return stale balanceAfter from original debit
      return { success: true, entry: earlyExisting, duplicate: true };
    }

    return this.ds.transaction(async (em: import('typeorm').EntityManager) => {
      // Lock the wallet row for the duration of the transaction (PgBouncer-safe)
      const lockedWallet = await em.getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId', { userId })
        .getOne();
      if (!lockedWallet) throw new NotFoundException('Wallet not found');

      const existing = await em.findOne(LedgerEntry, {
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return { success: true, entry: existing, newBalance: Number(existing.balanceAfter) };
      }

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: lockedWallet.id } });

      if (Number(bal.available) < dto.amount) {
        return { success: false, insufficientFunds: true };
      }

      const newBal = Number(bal.available) - dto.amount;
      const entry = em.create(LedgerEntry, {
        walletId: lockedWallet.id,
        entryType: EntryType.DEBIT,
        amount: dto.amount,
        direction: -1,
        balanceAfter: newBal,
        referenceId: dto.referenceId,
        referenceType: dto.referenceType,
        idempotencyKey: dto.idempotencyKey,
        description: dto.description,
      });
      await em.save(entry);
      await em.update(WalletBalance, { walletId: lockedWallet.id }, { available: newBal });
      await em.update(Wallet, { id: lockedWallet.id }, { availableBalance: newBal });
      return { success: true, entry, newBalance: newBal };
    });
  }

  async hold(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
  ): Promise<WalletHold> {
    const wallet = await this.getOrCreate(userId);
    this.assertWalletWritable(wallet);

    const idempotencyKey = `hold-${referenceType}-${referenceId}`;

    const earlyExisting = await this.ledger.findOne({ where: { idempotencyKey } });
    if (earlyExisting) {
      const existing = await this.holds.findOne({ where: { ledgerEntryId: earlyExisting.id } });
      if (existing) return existing;
    }

    return this.ds.transaction(async (em: import('typeorm').EntityManager) => {
      // Lock the wallet row for the duration of the transaction (PgBouncer-safe)
      const lockedWallet = await em.getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId', { userId })
        .getOne();
      if (!lockedWallet) throw new NotFoundException('Wallet not found');

      const existing = await em.findOne(LedgerEntry, { where: { idempotencyKey } });
      if (existing) {
        const dup = await em.findOne(WalletHold, { where: { ledgerEntryId: existing.id } });
        if (dup) return dup;
      }

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: lockedWallet.id } });
      if (Number(bal.available) < amount) {
        throw new BadRequestException("Insufficient funds for hold");
      }

      const newAvailable = Number(bal.available) - amount;
      const newHeld      = Number(bal.held) + amount;

      const entry = em.create(LedgerEntry, {
        walletId: lockedWallet.id,
        entryType: EntryType.HOLD,
        amount,
        direction: -1,
        balanceAfter: newAvailable,
        referenceId,
        referenceType,
        idempotencyKey,
        description: `Hold for ${referenceType}`,
      });
      await em.save(entry);

      const holdRecord = em.create(WalletHold, {
        walletId: lockedWallet.id,
        ledgerEntryId: entry.id,
        amount,
        referenceId,
        referenceType,
        status: HoldStatus.ACTIVE,
      });
      await em.save(holdRecord);

      await em.update(WalletBalance, { walletId: lockedWallet.id }, {
        available: newAvailable,
        held: newHeld,
      });
      await em.update(Wallet, { id: lockedWallet.id }, {
        availableBalance: newAvailable,
        heldBalance: newHeld,
      });
      return holdRecord;
    });
  }

  async releaseHold(holdId: string): Promise<void> {
    const holdRecord = await this.holds.findOne({ where: { id: holdId } });
    if (!holdRecord) throw new NotFoundException("Hold not found");
    if (holdRecord.status !== HoldStatus.ACTIVE) return;

    await this.ds.transaction(async (em: import('typeorm').EntityManager) => {
      // Lock the wallet row for the duration of the transaction (PgBouncer-safe)
      await em.getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :walletId', { walletId: holdRecord.walletId })
        .getOne();

      const fresh = await em.findOneOrFail(WalletHold, { where: { id: holdId } });
      if (fresh.status !== HoldStatus.ACTIVE) return;

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: fresh.walletId } });
      const newAvailable = Number(bal.available) + Number(fresh.amount);
      const newHeld      = Math.max(0, Number(bal.held) - Number(fresh.amount));

      const entry = em.create(LedgerEntry, {
        walletId: fresh.walletId,
        entryType: EntryType.RELEASE,
        amount: Number(fresh.amount),
        direction: 1,
        balanceAfter: newAvailable,
        referenceId: fresh.referenceId,
        referenceType: fresh.referenceType,
        idempotencyKey: `release-${holdId}`,
        description: "Hold released",
      });
      await em.save(entry);

      await em.update(WalletBalance, { walletId: fresh.walletId }, {
        available: newAvailable,
        held: newHeld,
      });
      await em.update(Wallet, { id: fresh.walletId }, {
        availableBalance: newAvailable,
        heldBalance: newHeld,
      });
      await em.update(WalletHold, { id: holdId }, {
        status: HoldStatus.RELEASED,
        releasedAt: new Date(),
      });
    });
  }

  /**
   * Release an active hold looked up by its referenceId.
   * Used as a compensating action when a downstream DB write fails after hold was committed.
   * No-ops silently if no active hold is found (idempotent).
   */
  async releaseHoldByReference(referenceId: string): Promise<void> {
    const holdRecord = await this.holds.findOne({
      where: { referenceId, status: HoldStatus.ACTIVE },
    });
    if (!holdRecord) return; // nothing to release — already released or never created
    await this.releaseHold(holdRecord.id);
  }

  /**
   * Capture (consume) an active hold by its holdId.
   * The held funds are permanently removed from the user's wallet — NOT returned.
   * Use this when a booking/session completes and the user's payment is settled.
   *
   * Contrast with releaseHold: release returns held → available; capture removes held entirely.
   */
  async captureHold(holdId: string): Promise<void> {
    const holdRecord = await this.holds.findOne({ where: { id: holdId } });
    if (!holdRecord) throw new NotFoundException("Hold not found");
    if (holdRecord.status !== HoldStatus.ACTIVE) return; // idempotent — already captured or released

    await this.ds.transaction(async (em: import('typeorm').EntityManager) => {
      // Lock the wallet row for the duration of the transaction (PgBouncer-safe)
      await em.getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :walletId', { walletId: holdRecord.walletId })
        .getOne();

      const fresh = await em.findOneOrFail(WalletHold, { where: { id: holdId } });
      if (fresh.status !== HoldStatus.ACTIVE) return; // idempotent inside TX

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: fresh.walletId } });
      // Decrement held — do NOT increment available (funds are consumed, not returned)
      const newHeld = Math.max(0, Number(bal.held) - Number(fresh.amount));

      const entry = em.create(LedgerEntry, {
        walletId: fresh.walletId,
        entryType: EntryType.DEBIT,
        amount: Number(fresh.amount),
        direction: -1,
        balanceAfter: Number(bal.available), // available is unchanged
        referenceId: fresh.referenceId,
        referenceType: fresh.referenceType,
        idempotencyKey: `capture-${holdId}`,
        description: 'Hold captured — payment consumed',
      });
      await em.save(entry);

      await em.update(WalletBalance, { walletId: fresh.walletId }, {
        held: newHeld,
        // available is intentionally NOT changed
      });
      await em.update(Wallet, { id: fresh.walletId }, {
        heldBalance: newHeld,
        // availableBalance is intentionally NOT changed
      });
      await em.update(WalletHold, { id: holdId }, {
        status: HoldStatus.CAPTURED, // funds consumed by payment capture (distinct from RELEASED = returned to user)
        releasedAt: new Date(),
      });
    });
  }

  /**
   * Capture an active hold looked up by its referenceId.
   * Consumes the held funds (payment settled). No-ops if no active hold found (idempotent).
   */
  async captureHoldByReference(referenceId: string): Promise<void> {
    const holdRecord = await this.holds.findOne({
      where: { referenceId, status: HoldStatus.ACTIVE },
    });
    if (!holdRecord) return; // nothing to capture — already captured/released or never created
    await this.captureHold(holdRecord.id);
  }

  /**
   * Cursor-based paginated ledger history for a user's wallet.
   *
   * Replaces the previous OFFSET approach — at 1M+ ledger entries,
   * deep-page OFFSET scans were O(n).  Keyset pagination is O(log n)
   * via the idx_ledger_wallet_created composite index.
   *
   * Cursor encodes (createdAt, id) of the last returned row.
   */
  async getTransactions(
    userId: string,
    cursor?: string,
    limit = 20,
    from?: string,
    to?: string,
  ): Promise<{ transactions: LedgerEntry[]; nextCursor: string | null }> {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet) return { transactions: [], nextCursor: null };

    const qb = this.ledger
      .createQueryBuilder('l')
      .where('l.walletId = :walletId', { walletId: wallet.id })
      .orderBy('l.createdAt', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .take(safeLimit + 1);

    // P3: Date-range filter for DPDP data-portability
    if (from) qb.andWhere('l.createdAt >= :from', { from: new Date(from) });
    if (to)   qb.andWhere('l.createdAt <= :to',   { to:   new Date(to) });

    if (cursor) {
      try {
        const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        qb.andWhere(
          '(l.createdAt < :d OR (l.createdAt = :d AND l.id < :i))',
          { d: new Date(d).toISOString(), i },
        );
      } catch {
        throw new BadRequestException('Invalid pagination cursor');
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    if (hasMore) rows.pop();

    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(JSON.stringify({ d: last.createdAt.toISOString(), i: last.id })).toString('base64url')
        : null;

    return { transactions: rows, nextCursor };
  }


  /**
   * Credit a PROVIDER wallet by providerId.
   * Provider wallets use ownerType='provider' and ownerId=providerId,
   * not userId, so the regular credit() which looks up by userId won't work.
   */
  async creditProvider(providerId: string, amountPaise: number, referenceId: string, description: string): Promise<void> {
    await this.ds.transaction(async (em) => {
      const wallet = await em.findOne(Wallet, {
        where: { ownerType: WalletOwnerType.PROVIDER, ownerId: providerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new NotFoundException(`Provider wallet not found for ${providerId}`);

      const bal = await em.findOneOrFail(WalletBalance, { where: { walletId: wallet.id } });
      const newBal = Number(bal.available) + amountPaise;

      const entry = em.create(LedgerEntry, {
        walletId: wallet.id,
        entryType: EntryType.CREDIT,
        amount: amountPaise,
        direction: 1,
        balanceAfter: newBal,
        referenceId,
        referenceType: 'PROVIDER_CREDIT',
        idempotencyKey: `provider-credit:${referenceId}`,
        description,
      });
      await em.save(entry);
      await em.update(WalletBalance, { walletId: wallet.id }, { available: newBal });
      await em.update(Wallet, { id: wallet.id }, { availableBalance: newBal });
    });
  }

  /**
   * P3: Export full ledger history as CSV for DPDP Act right-to-access.
   * Capped at 10 000 rows to prevent OOM on pathological accounts.
   */
  async exportTransactionsCsv(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<string> {
    const wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet) return 'id,entryType,amount,direction,balanceAfter,description,referenceType,createdAt\n';

    const qb = this.ledger
      .createQueryBuilder('l')
      .where('l.walletId = :walletId', { walletId: wallet.id })
      .orderBy('l.createdAt', 'DESC')
      .take(5_000);

    if (from) qb.andWhere('l.createdAt >= :from', { from: new Date(from) });
    if (to)   qb.andWhere('l.createdAt <= :to',   { to:   new Date(to) });

    const rows = await qb.getMany();
    const header = 'id,entryType,amount,direction,balanceAfter,description,referenceType,createdAt\n';
    const body = rows.map(l =>
      [
        l.id,
        l.entryType ?? '',
        l.amount ?? '',
        l.direction ?? '',
        l.balanceAfter ?? '',
        `"${(l.description ?? '').replace(/"/g, '""')}"`,
        l.referenceType ?? '',
        l.createdAt?.toISOString() ?? '',
      ].join(','),
    ).join('\n');
    return header + body;
  }

}
