import axios from 'axios';
import { createHash } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from '../email/email.service';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProviderEarning,
  EarningStatus,
  ReferenceType,
} from './entities/provider-earning.entity';
import { PayoutBatch, BatchStatus } from './entities/payout-batch.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationType } from '../notifications/entities/notification.entity';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PendingEarningsSummary {
  totalPaise: number;
  count: number;
}

// Encryption delegated to shared EncryptionService (see common/encryption/)

@Injectable()
export class PayoutService implements OnModuleInit {
  private readonly logger = new Logger(PayoutService.name);
  constructor(
    @InjectRepository(ProviderEarning)
    private readonly earningRepo: Repository<ProviderEarning>,
    @InjectRepository(PayoutBatch)
    private readonly batchRepo: Repository<PayoutBatch>,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly notifs: NotificationsService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionService,
  ) {}

  private rzpKeyId!: string;
  private rzpKeySecret!: string;
  private rzpXAccount!: string;

  async onModuleInit(): Promise<void> {
    this.rzpKeyId = this.config.getOrThrow<string>('razorpay.keyId');
    this.rzpKeySecret = this.config.getOrThrow<string>('razorpay.keySecret');
    this.rzpXAccount = this.config.getOrThrow<string>('razorpay.xAccountNumber');
  }

  async recordEarning(
    providerId: string,
    referenceId: string,
    referenceType: string,
    grossPaise: number,
    feePaise: number,
    tdsPaise: number,
  ): Promise<ProviderEarning> {
    if (!Number.isInteger(grossPaise) || grossPaise <= 0) {
      throw new BadRequestException('grossPaise must be a positive integer');
    }
    if (!Number.isInteger(feePaise) || feePaise < 0) {
      throw new BadRequestException('feePaise must be a non-negative integer');
    }
    if (!Number.isInteger(tdsPaise) || tdsPaise < 0) {
      throw new BadRequestException('tdsPaise must be a non-negative integer');
    }
    const netAmountPaise = grossPaise - feePaise - tdsPaise;
    if (netAmountPaise <= 0) {
      throw new BadRequestException('Net amount must be positive after deductions');
    }
    const earning = this.earningRepo.create({
      providerId,
      referenceId,
      referenceType: referenceType as ReferenceType,
      grossAmountPaise: grossPaise,
      platformFeePaise: feePaise,
      tdsDeductedPaise: tdsPaise,
      netAmountPaise,
      status: EarningStatus.PENDING,
      earnedAt: new Date(),
    });
    return this.earningRepo.save(earning);
  }

  async scheduleBatch(providerId: string): Promise<PayoutBatch> {
    return this.earningRepo.manager.transaction(async (em) => {
      const earningRepo = em.getRepository(ProviderEarning);
      const batchRepo   = em.getRepository(PayoutBatch);

      const pendingEarnings = await earningRepo
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where('e.provider_id = :providerId AND e.status = :status', {
          providerId,
          status: EarningStatus.PENDING,
        })
        .getMany();

      if (pendingEarnings.length === 0) {
        throw new BadRequestException('No pending earnings to settle');
      }
      const totalAmountPaise = pendingEarnings.reduce(
        (sum: number, e: ProviderEarning) => sum + Number(e.netAmountPaise),
        0,
      );
      const settlementDate = new Date();
      settlementDate.setDate(settlementDate.getDate() + 2);

      const batch = await batchRepo.save(
        batchRepo.create({
          providerId,
          totalAmountPaise,
          settlementDate,
          status: BatchStatus.SCHEDULED,
        }),
      );

      await earningRepo
        .createQueryBuilder()
        .update(ProviderEarning)
        .set({ payoutBatchId: batch.id })
        .where('id IN (:...ids)', { ids: pendingEarnings.map((e: ProviderEarning) => e.id) })
        .execute();

      return batch;
    });
  }

  async processBatch(batchId: string): Promise<PayoutBatch> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('PayoutBatch ' + batchId + ' not found');

    // Idempotent: already completed — return immediately without re-calling Razorpay
    if (batch.status === BatchStatus.COMPLETED) {
      this.logger.log(`processBatch: batch ${batchId} already COMPLETED — skipping`);
      return batch;
    }

    // Atomic compare-and-swap: SCHEDULED → PROCESSING.
    // Only the worker that wins the UPDATE proceeds; others see affected=0 and bail.
    // This prevents two concurrent workers from both calling Razorpay for the same batch.
    const claimed = await this.batchRepo.update(
      { id: batchId, status: BatchStatus.SCHEDULED },
      { status: BatchStatus.PROCESSING },
    );
    if (!claimed.affected) {
      this.logger.warn(
        `processBatch: batch ${batchId} was already claimed by another worker (status=${batch.status})`,
      );
      throw new BadRequestException(
        'Batch is in ' + batch.status + ' state; only SCHEDULED batches can be processed',
      );
    }
    batch.status = BatchStatus.PROCESSING;
    await this.earningRepo
      .createQueryBuilder()
      .update(ProviderEarning)
      .set({ status: EarningStatus.IN_SETTLEMENT })
      .where('payout_batch_id = :batchId AND status = :pending', {
        batchId: batch.id,
        pending: EarningStatus.PENDING,
      })
      .execute();

    try {
      const bankRows = await this.batchRepo.manager.query<
        Array<{
          account_number_encrypted: string;
          ifsc_code: string | null;
          beneficiary_name: string | null;
        }>
      >(
        'SELECT account_number_encrypted, ifsc_code, beneficiary_name' +
        ' FROM provider_bank_accounts' +
        ' WHERE provider_id = $1 AND is_primary = true LIMIT 1',
        [batch.providerId],
      );
      if (!bankRows.length) {
        throw new BadRequestException(
          'Provider has no bank account registered for payouts',
        );
      }
      const bankRow = bankRows[0];
      const ifsc = bankRow.ifsc_code ?? '';
      // M5: account_number_encrypted is AES-256-GCM encrypted at rest.
      // Decrypt before sending to Razorpay; never pass the ciphertext as a bank
      // account number — that would cause Razorpay to reject the payout silently.
      const accountNumber = this.encryption.decrypt(bankRow.account_number_encrypted, 'PAYOUT_ENCRYPTION_KEY');
      const beneficiaryName = bankRow.beneficiary_name ?? 'Provider';
      if (!ifsc || !accountNumber) {
        throw new BadRequestException(
          'Provider bank account is incomplete (missing IFSC or account number)',
        );
      }

      const userRows = await this.batchRepo.manager.query<
        Array<{ email: string; name: string }>
      >(
        'SELECT u.email, u.name FROM users u WHERE u.id = $1 LIMIT 1',
        [batch.providerId],
      );
      const userRow = userRows[0] as { email: string; name: string } | undefined;

      const rzpKeyId = this.rzpKeyId;
      const rzpKeySecret = this.rzpKeySecret;
      const rzpXAccount = this.rzpXAccount;

      // M3: Deterministic idempotency key prevents double-charge on retry.
      // The key is derived from (providerId, batchId, amount) — same inputs always
      // produce the same key, so Razorpay returns the existing payout on retry.
      const idempotencyKey = createHash('sha256')
        .update(`${batch.providerId}:${batch.id}:${batch.totalAmountPaise}`)
        .digest('hex');

      const rzpResponse = await axios.post<{ id: string; utr?: string }>(
        'https://api.razorpay.com/v1/payouts',
        {
          account_number: rzpXAccount,
          amount: batch.totalAmountPaise,
          currency: 'INR',
          mode: 'IMPS',
          purpose: 'payout',
          fund_account: {
            account_type: 'bank_account',
            bank_account: {
              name: beneficiaryName,
              ifsc,
              account_number: accountNumber,
            },
            contact: {
              name: beneficiaryName,
              email: userRow ? userRow.email : 'noreply@religiogram.app',
              type: 'vendor',
            },
          },
          queue_if_low_balance: true,
          reference_id: batch.id,
          narration: 'ReligioGram Provider Payout',
        },
        {
          auth: { username: rzpKeyId, password: rzpKeySecret },
          timeout: 15000,
          headers: { 'X-Idempotency-Key': idempotencyKey },
        },
      );

      const gatewayPayoutId = rzpResponse.data.id;
      const utrNumber = rzpResponse.data.utr ?? null;

      // Atomically mark all earnings PAID and the batch COMPLETED in a single transaction.
      await this.earningRepo.manager.transaction(async (em) => {
        await em
          .createQueryBuilder()
          .update(ProviderEarning)
          .set({ status: EarningStatus.PAID })
          .where('payout_batch_id = :batchId AND status = :inSettlement', {
            batchId: batch.id,
            inSettlement: EarningStatus.IN_SETTLEMENT,
          })
          .execute();

        batch.status = BatchStatus.COMPLETED;
        batch.gatewayPayoutId = gatewayPayoutId;
        batch.utrNumber = utrNumber;
        batch.processedAt = new Date();

        // Both writes committed atomically — idempotency guard fires on any retry.
        await em.save(batch);
      });

      if (userRow && userRow.email) {
        this.emailService
          .sendPayoutNotification(userRow.email, {
            providerName: userRow.name ?? 'Provider',
            amountInr: Math.round(batch.totalAmountPaise / 100),
            utrNumber: utrNumber ?? 'Pending',
            bankLast4: accountNumber.slice(-4),
            payoutDate: new Date(),
          })
          .catch(() => {});
      }

      // In-app notification for the provider
      const amountInr = Math.round(batch.totalAmountPaise / 100);
      this.notifs.send(
        batch.providerId,
        NotificationType.PAYOUT_PROCESSED,
        '💰 Payout Processed',
        `₹${amountInr} has been transferred to your bank account. UTR: ${utrNumber ?? 'Pending'}.`,
        { batchId: batch.id, amountInr: String(amountInr), utrNumber: utrNumber ?? '' },
      ).catch(() => {});
    } catch (err) {
      // Roll back earnings to PENDING so they can be included in a future batch
      try {
        await this.earningRepo
          .createQueryBuilder()
          .update(ProviderEarning)
          .set({ status: EarningStatus.PENDING, payoutBatchId: null })
          .where('payout_batch_id = :batchId AND status = :inSettlement', {
            batchId: batch.id,
            inSettlement: EarningStatus.IN_SETTLEMENT,
          })
          .execute();
      } catch (rollbackErr) {
        this.logger.error(
          `Failed to rollback earnings for batch ${batch.id}: ${(rollbackErr as Error).message}`,
        );
      }

      batch.failureReason = err instanceof Error ? err.message : 'Unknown error';
      batch.processedAt = new Date();

      // 1. Mark FAILED — write durably so the failed state is briefly observable.
      batch.status = BatchStatus.FAILED;
      batch.failureReason = err instanceof Error ? err.message : 'Unknown error';
      batch.processedAt = new Date();
      await this.batchRepo.save(batch).catch((e: Error) =>
        this.logger.error(`Failed to save FAILED status for batch ${batch.id}: ${e.message}`),
      );

      // 2. Revert to SCHEDULED for retry (separate write, so FAILED is durably visible first).
      await this.batchRepo.update({ id: batch.id, status: BatchStatus.FAILED }, { status: BatchStatus.SCHEDULED })
        .catch((e: Error) =>
          this.logger.error(`Failed to revert batch ${batch.id} to SCHEDULED: ${e.message}`),
        );
      batch.status = BatchStatus.SCHEDULED;
    }

    return this.batchRepo.findOne({ where: { id: batch.id } }) as Promise<PayoutBatch>;
  }

  async getProviderEarnings(
    providerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ProviderEarning>> {
    const safeTake = Math.min(100, Math.max(1, limit));
    const [data, total] = await this.earningRepo.findAndCount({
      where: { providerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * safeTake,
      take: safeTake,
    });
    return { data, total, page, limit: safeTake, pages: Math.ceil(total / safeTake) };
  }

  async getProviderPayouts(
    providerId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<PayoutBatch>> {
    const safeTake = Math.min(100, Math.max(1, limit));
    const [data, total] = await this.batchRepo.findAndCount({
      where: { providerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * safeTake,
      take: safeTake,
    });
    return { data, total, page, limit: safeTake, pages: Math.ceil(total / safeTake) };
  }

  async getPendingEarnings(providerId: string): Promise<PendingEarningsSummary> {
    const rows = await this.earningRepo.find({
      where: { providerId, status: EarningStatus.PENDING },
      select: ['netAmountPaise'],
      take: 500,
    });
    const totalPaise = rows.reduce((sum, r) => sum + Number(r.netAmountPaise), 0);
    return { totalPaise, count: rows.length };
  }
  /**
   * Weekly cron: process all SCHEDULED payout batches with a circuit breaker.
   * If Razorpay fails consecutively CIRCUIT_BREAKER_THRESHOLD times, abort the run
   * to avoid flooding Razorpay with doomed requests and spamming the error log.
   */
  @Cron('0 2 * * 1', { name: 'payout-batch-processor', timeZone: 'UTC' }) // every Monday 02:00 UTC
  async processAllScheduledBatches(): Promise<void> {
    // Distributed lock prevents all pods from firing simultaneously
    const lockKey = 'payout:schedule:lock';
    const lockTtl = 300; // 5 minutes
    const acquired = await this.redis.setIfNotExists(lockKey, '1', lockTtl);
    if (!acquired) {
      this.logger.debug('Payout cron lock not acquired — another pod is running');
      return;
    }

    try {
      const pendingBatches = await this.batchRepo.find({
        where: { status: BatchStatus.SCHEDULED },
        order: { createdAt: 'ASC' },
        take: 200,
      });

      if (!pendingBatches.length) {
        this.logger.log('processAllScheduledBatches: no SCHEDULED batches found');
        return;
      }

      this.logger.log(`processAllScheduledBatches: processing ${pendingBatches.length} batch(es)`);

      let consecutiveFailures = 0;
      const CIRCUIT_BREAKER_THRESHOLD = 5;

      for (const batch of pendingBatches) {
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          this.logger.error(
            `Payout circuit breaker tripped after ${consecutiveFailures} consecutive failures — aborting batch run`,
          );
          break;
        }
        try {
          const result = await this.processBatch(batch.id);
          if (result.status === BatchStatus.COMPLETED) {
            consecutiveFailures = 0; // reset on success
          } else {
            // processBatch reverts FAILED→SCHEDULED; treat as failure for circuit breaker
            consecutiveFailures++;
            this.logger.warn(`Batch ${batch.id} did not complete (status=${result.status}); consecutiveFailures=${consecutiveFailures}`);
          }
        } catch (err) {
          consecutiveFailures++;
          this.logger.error({ err, batchId: batch.id }, `Payout batch failed — consecutiveFailures=${consecutiveFailures}`);
        }
      }

      this.logger.log('processAllScheduledBatches: run complete');
    } finally {
      await this.redis.del(lockKey).catch(() => {});
    }
  }

}
