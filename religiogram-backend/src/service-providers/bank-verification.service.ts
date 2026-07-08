import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  BankVerificationStatus,
  ProviderBankAccount,
} from './entities/provider-bank-account.entity';
import { ProviderEntity } from './entities/provider.entity';
import { EncryptionService } from '../common/encryption/encryption.service';

/**
 * BankVerificationService — RazorpayX penny-drop verification scaffold.
 *
 * Full RazorpayX integration includes:
 *   1. POST /v1/contacts            → create a contact for the provider
 *   2. POST /v1/fund_accounts       → attach the bank/UPI account as a
 *                                     fund_account (RazorpayX runs a penny
 *                                     drop automatically at this step)
 *   3. Wait for fund_account.validated / .failed webhook
 *
 * This service implements steps (1) and (2) behind an env-gated switch so
 * the rest of the codebase can call it uniformly without needing to know
 * whether RazorpayX is configured yet.
 *
 *   - If RAZORPAYX_KEY_ID + RAZORPAYX_KEY_SECRET are unset, the call is a
 *     no-op that marks the account as `skipped` — onboarding still
 *     completes and payouts fall through to manual reconciliation.
 *   - Otherwise the service POSTs to Razorpay's API using Basic auth
 *     (keyId:keySecret base64) and stores the returned fund_account_id.
 *     Status becomes `pending`; the eventual verified/failed transition
 *     happens via a webhook handler (out of scope for this scaffold).
 *
 * Never blocks onboarding. Any exception is caught, logged, and the
 * account remains in whatever status it was in before the call.
 */
@Injectable()
export class BankVerificationService {
  private readonly logger = new Logger(BankVerificationService.name);

  constructor(
    @InjectRepository(ProviderBankAccount)
    private readonly bankRepo: Repository<ProviderBankAccount>,
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Kick off verification for the primary bank account on `providerId`.
   * Returns quickly (best-effort HTTP with a short timeout). Callers do
   * NOT need to await — fire-and-forget from the onboarding hook.
   */
  async verifyBankAccount(providerId: string): Promise<{
    status: BankVerificationStatus;
    fundAccountId?: string;
  }> {
    const row = await this.bankRepo.findOne({
      where: { providerId, isPrimary: true },
    });
    if (!row) {
      this.logger.warn(`verifyBankAccount: no primary bank row for provider=${providerId}`);
      return { status: BankVerificationStatus.UNVERIFIED };
    }

    // Env-gated — if RazorpayX isn't configured, mark as skipped so the ops
    // dashboard can see which providers still need manual verification.
    // Reuse the existing `razorpay` config namespace instead of introducing
    // a new one — keyId/keySecret are the same credentials used everywhere.
    const keyId = this.config.get<string>('razorpay.keyId');
    const keySecret = this.config.get<string>('razorpay.keySecret');
    if (!keyId || !keySecret) {
      await this.bankRepo.update(
        { id: row.id },
        {
          verificationStatus: BankVerificationStatus.SKIPPED,
          verificationAttemptedAt: new Date(),
        },
      );
      this.logger.warn(
        `RazorpayX creds unset — marked provider=${providerId} bank as SKIPPED`,
      );
      return { status: BankVerificationStatus.SKIPPED };
    }

    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      return { status: BankVerificationStatus.UNVERIFIED };
    }

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    try {
      // 1. Create RazorpayX contact — idempotent by reference_id.
      const contactPayload = {
        name: provider.fullName || 'ReligioGram Provider',
        email: (provider as any).email ?? undefined,
        contact: (provider as any).phone ?? undefined,
        type: 'vendor',
        reference_id: `provider:${providerId}`,
      };
      const contactRes = await this.postJson(
        'https://api.razorpay.com/v1/contacts',
        contactPayload,
        authHeader,
      );
      const contactId: string | undefined = (contactRes as any)?.id;
      if (!contactId) {
        throw new Error('Razorpay contacts response missing id');
      }

      // 2. Create fund_account — RazorpayX runs the penny drop here.
      let accountNumber: string | undefined;
      try {
        // account_number_encrypted is AES-256-GCM under PAYOUT_ENCRYPTION_KEY;
        // decrypt only inside this scoped block so plaintext never leaves.
        const decrypted = this.encryption.decrypt(
          row.accountNumberEncrypted,
          'PAYOUT_ENCRYPTION_KEY',
        );
        if (decrypted && decrypted !== '__UPI__') accountNumber = decrypted;
      } catch { /* fall through — treat as UPI-only */ }

      const isBank = !!accountNumber && !!row.ifscCode;
      const faPayload = isBank
        ? {
            contact_id: contactId,
            account_type: 'bank_account',
            bank_account: {
              name: row.beneficiaryName ?? provider.fullName ?? 'Provider',
              ifsc: row.ifscCode,
              account_number: accountNumber,
            },
          }
        : {
            contact_id: contactId,
            account_type: 'vpa',
            vpa: { address: row.upiId ?? '' },
          };
      const faRes = await this.postJson(
        'https://api.razorpay.com/v1/fund_accounts',
        faPayload,
        authHeader,
      );
      const fundAccountId: string | undefined = (faRes as any)?.id;
      if (!fundAccountId) {
        throw new Error('Razorpay fund_accounts response missing id');
      }

      await this.bankRepo.update(
        { id: row.id },
        {
          verificationStatus: BankVerificationStatus.PENDING,
          verificationAttemptedAt: new Date(),
          razorpayFundAccountId: fundAccountId,
        },
      );
      this.logger.log(
        `RazorpayX fund_account created for provider=${providerId} fund_account_id=${fundAccountId}`,
      );
      return { status: BankVerificationStatus.PENDING, fundAccountId };
    } catch (err) {
      // Failure never blocks onboarding — just log and leave the row alone.
      this.logger.error(
        `verifyBankAccount failed for provider=${providerId}: ${(err as Error).message}`,
      );
      await this.bankRepo
        .update({ id: row.id }, { verificationAttemptedAt: new Date() })
        .catch(() => {});
      return { status: row.verificationStatus };
    }
  }

  /**
   * Minimal fetch-based POST — kept in-service to avoid pulling in axios
   * for a scaffold. Node 18+ ships global `fetch`. 8 s timeout so a
   * Razorpay hiccup can't stall onboarding.
   *
   * Post-audit-#5: added exponential-backoff retry for transient upstream
   * errors (429 rate-limit + 5xx). Client errors (4xx that are not 429)
   * are NOT retried — those mean bad input, retrying won't help. Fire-and-
   * forget from the onboarding path is unchanged: the whole method is
   * wrapped in a try/catch by the caller and never blocks the wizard.
   */
  private static readonly RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  private static readonly BACKOFF_MS = [500, 2_000, 8_000] as const;

  private async postJson(url: string, body: unknown, authHeader: string): Promise<unknown> {
    const MAX_ATTEMPTS = 3;
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const text = await res.text();
        const parsed = text ? JSON.parse(text) : {};
        if (res.ok) return parsed;

        const isRetryable = BankVerificationService.RETRYABLE_STATUS.has(res.status);
        const errMsg = `Razorpay ${res.status}: ${(parsed as any)?.error?.description ?? text.slice(0, 200)}`;
        lastErr = new Error(errMsg);
        if (!isRetryable || attempt === MAX_ATTEMPTS) {
          // 4xx (except 429) or out of attempts — surface immediately.
          throw lastErr;
        }
        const delay = BankVerificationService.BACKOFF_MS[attempt - 1] ?? 8_000;
        this.logger.warn(
          `RazorpayX ${res.status} on ${url} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      } catch (err) {
        // AbortError / network error → treat as retryable.
        const isAbort = (err as Error)?.name === 'AbortError';
        const isKnownHttpErr = lastErr && err === lastErr; // rethrown above
        if (isKnownHttpErr) throw err;
        lastErr = err as Error;
        if (attempt === MAX_ATTEMPTS) throw lastErr;
        const delay = BankVerificationService.BACKOFF_MS[attempt - 1] ?? 8_000;
        this.logger.warn(
          `RazorpayX ${isAbort ? 'timeout' : 'network err'} on ${url} (attempt ${attempt}/${MAX_ATTEMPTS}): ${lastErr.message} — retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    // Unreachable — the loop either returns or throws.
    throw lastErr ?? new Error('Razorpay retry loop exited unexpectedly');
  }
}
