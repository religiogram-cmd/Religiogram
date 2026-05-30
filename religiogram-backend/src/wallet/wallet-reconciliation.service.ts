import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletHold, HoldStatus } from './entities/wallet-hold.entity';
import { AlertsService } from '../common/alerts/alerts.service';
import { WalletService } from './wallet.service';

interface ReconResult {
  walletsChecked: number;
  mismatches: number;
  frozenWallets: string[];
  recoveredHolds: number;
  durationMs: number;
  status: 'ok' | 'mismatches_found' | 'error';
}

@Injectable()
export class WalletReconciliationService {
  private readonly logger = new Logger(WalletReconciliationService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Wallet)        private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletBalance) private readonly balances: Repository<WalletBalance>,
    @InjectRepository(WalletHold)    private readonly holds: Repository<WalletHold>,
    private readonly walletService: WalletService,
    private readonly alerts: AlertsService,
  ) {}

  /**
   * Hourly shard reconciliation (plan P1-1).
   *
   * Instead of a single 2 AM daily sweep over every wallet (which creates a
   * DB read spike), we split work across 24 equal shards: each clock hour
   * processes only the 1/24th of wallets whose ID hashes to that hour slot.
   *
   *   shard = abs(hashtext(wallet.id::text)) % 24  ==  EXTRACT(HOUR FROM NOW())
   *
   * Across a full day every wallet is checked exactly once.  Peak DB load is
   * ~4% of the old single-run load and is evenly distributed.
   */
  @Cron('0 * * * *', { name: 'wallet-hourly-shard-recon', timeZone: 'UTC' })
  async runHourlyShardReconciliation(): Promise<ReconResult> {
    const started = Date.now();
    const hour = new Date().getUTCHours(); // 0-23 — this run's shard slot
    this.logger.log(`Starting hourly wallet recon — shard ${hour}/24`);

    let walletsChecked = 0;
    let mismatches = 0;
    const frozenWallets: string[] = [];

    try {
      /**
       * Pull IDs for just this shard in a single query so we keep the
       * per-wallet checkWallet() calls independent (avoids N+1 on the
       * full table while still being cursor-friendly).
       * hashtext() returns a signed 32-bit int; ABS ensures a 0-23 range.
       */
      const shardWalletIds = await this.ds.query<{ id: string }[]>(
        `SELECT w.id
         FROM wallets w
         WHERE w.status <> $1
           AND ABS(HASHTEXT(w.id::text)) % 24 = $2
         ORDER BY w.id`,
        [WalletStatus.CLOSED, hour],
      ).then((rows: { id: string }[]) => rows.map((r) => r.id));

      // Batched query: replaces N×3 per-wallet queries with 1 query for the shard
      const mismatchRows = await this.ds.query<{
        wallet_id: string; available: string; held: string; ledger_balance: string;
      }[]>(`
        SELECT
          w.id AS wallet_id,
          wb.available,
          wb.held,
          COALESCE(SUM(le.amount_paise * le.direction), 0) AS ledger_balance
        FROM wallets w
        LEFT JOIN wallet_balances wb ON wb.wallet_id = w.id
        LEFT JOIN ledger_entries le ON le.wallet_id = w.id
        WHERE w.id = ANY($1)
        GROUP BY w.id, wb.available, wb.held
        HAVING ABS(COALESCE(SUM(le.amount_paise * le.direction), 0) - (COALESCE(wb.available, 0) + COALESCE(wb.held, 0))) > 1
      `, [shardWalletIds]);

      walletsChecked = shardWalletIds.length;

      for (const row of mismatchRows) {
        const wallet = await this.wallets.findOne({ where: { id: row.wallet_id } });
        if (!wallet) continue;
        const cachedBalance = Number(row.available ?? 0) + Number(row.held ?? 0);
        const ledgerBalance = Number(row.ledger_balance);
        const delta = Math.abs(ledgerBalance - cachedBalance);
        const mismatch = `cached=${cachedBalance} ledger=${ledgerBalance} delta=${delta}`;
        mismatches++;
        frozenWallets.push(wallet.id);
        await this.freezeWallet(wallet, mismatch);
      }

      const result: ReconResult = {
        walletsChecked,
        mismatches,
        frozenWallets,
        recoveredHolds: 0,
        durationMs: Date.now() - started,
        status: mismatches > 0 ? 'mismatches_found' : 'ok',
      };

      if (mismatches > 0) {
        await this.alerts.fire({
          channel: 'wallet_reconciliation',
          severity: 'critical',
          message: `Hourly recon shard ${hour}: ${mismatches} wallet mismatches detected and frozen`,
          context: { frozenWallets },
        });
      } else {
        this.logger.log(
          `Hourly recon shard ${hour} OK: ${walletsChecked} wallets checked in ${result.durationMs}ms`,
        );
      }

      await this.logReconResult(result);
      return result;
    } catch (err) {
      this.logger.error(`Hourly reconciliation shard ${hour} failed`, err);
      await this.alerts.fire({
        channel: 'wallet_reconciliation',
        severity: 'critical',
        message: `Hourly wallet reconciliation shard ${hour} failed with exception`,
        error: err as Error,
      });
      return {
        walletsChecked, mismatches, frozenWallets,
        recoveredHolds: 0, durationMs: Date.now() - started, status: 'error',
      };
    }
  }

  @Cron('*/15 * * * *', { name: 'stuck-holds-recovery' })
  async recoverStuckHolds(): Promise<number> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const stuckHolds = await this.ds.query<{ id: string }[]>(
      `SELECT wh.id
       FROM wallet_holds wh
       JOIN bookings b ON b.id::text = wh.reference_id
       WHERE wh.status = $1
         AND wh.created_at < $2
         AND b.status IN ('completed','cancelled','refunded','payment_failed')`,
      [HoldStatus.ACTIVE, twoHoursAgo],
    );

    if (stuckHolds.length === 0) return 0;
    this.logger.warn(`Recovering ${stuckHolds.length} stuck wallet holds`);

    let recovered = 0;
    for (const row of stuckHolds) {
      try {
        await this.walletService.releaseHold(row.id);
        recovered++;
      } catch (err) {
        this.logger.error(`Failed to recover hold ${row.id}`, err);
      }
    }
    if (recovered > 0) this.logger.log(`Recovered ${recovered} stuck holds`);
    return recovered;
  }

  private async freezeWallet(wallet: Wallet, reason: string): Promise<void> {
    this.logger.warn(`Freezing wallet ${wallet.id}: ${reason}`);
    try {
      await this.wallets.update(wallet.id, {
        status: WalletStatus.FROZEN,
        lockReason: `Reconciliation mismatch: ${reason}`,
      });
      await this.alerts.fire({
        channel: 'wallet_reconciliation',
        severity: 'critical',
        message: `[RECON] Wallet frozen — id=${wallet.id} reason=${reason}`,
      });
    } catch (err) {
      this.logger.error(`Failed to freeze wallet ${wallet.id}`, err);
    }
  }

  private async logReconResult(result: ReconResult): Promise<void> {
    this.logger.log(
      `[RECON] checked=${result.walletsChecked} ` +
      `mismatches=${result.mismatches} frozen=${String(result.frozenWallets)} ` +
      `durationMs=${result.durationMs}`,
    );
  }

}
