import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { ADVISORY_LOCK_KEYS } from '../common/db/advisory-locks';  // v10 (P1-C): static import
import { Cron } from '@nestjs/schedule';
import { AlertsService } from '../common/alerts/alerts.service';

export interface AuditActionParams {
  adminId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  justification: string;
  ipAddress?: string;
}

/**
 * AdminAuditService — §109 Auditability spec
 *
 * Every admin action is written to admin_action_logs with a SHA-256
 * hash chain. Each entry's hashChain = SHA256(prevHash || id || actionType
 * || targetId || createdAt). A nightly job validates the entire chain.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertsService,
  ) {}

  async log(params: AuditActionParams): Promise<void> {
    // BUG-20 (v8): hash-chain write must be serialised across concurrent
    // admin actions, else two parallel writers read the same prev_hash and
    // chain forks. Take a single int-keyed advisory lock for the whole
    // admin_action_logs table; cheap (no row lock) and correctly orders
    // writers without blocking unrelated traffic.
    await this.ds.transaction(async (em) => {
      await em.query(
        `SELECT pg_advisory_xact_lock($1::bigint)`,
        [ADVISORY_LOCK_KEYS.ADMIN_AUDIT_HASH_CHAIN.toString()],
      );

      const [row] = await em.query<{ hash_chain: string }[]>(
        `SELECT hash_chain FROM admin_action_logs ORDER BY app_recorded_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      );
      const prevHash = row?.hash_chain ?? '0'.repeat(64);
      // v11 (GAP-1 fix): take the app-side timestamp ONCE, persist it as
      // `app_recorded_at`, and hash THAT same value. The previous formula
      // computed `new Date().toISOString()` in the writer but the validator
      // re-read Postgres `created_at` — different values → every row
      // failed validation.
      const appRecordedAt = new Date();
      await em.query(`
        INSERT INTO admin_action_logs
          (admin_id, action_type, target_type, target_id,
           before_state, after_state, justification, ip_address,
           hash_chain, app_recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        params.adminId,
        params.actionType,
        params.targetType,
        params.targetId,
        JSON.stringify(params.beforeState ?? {}),
        JSON.stringify(params.afterState ?? {}),
        params.justification,
        params.ipAddress ?? null,
        AdminAuditService.computeChainHash(prevHash, params, appRecordedAt),
        appRecordedAt,
      ]);
    });
  }

  // ── Nightly hash-chain validation ─────────────────────────────────────
  @Cron('0 3 * * *', { name: 'audit-chain-validate', timeZone: 'UTC' })
  /**
   * v11 (GAP-1 fix): validate using the EXACT same formula as the writer,
   * sourced from the persisted `app_recorded_at` column.
   *
   * v11 (GAP-6 fix): stream rows instead of loading the entire chain into
   * memory. At 1M audit rows the old `query()` materialised ~1GB; the
   * stream uses a server-side cursor and validates incrementally.
   */
  async validateHashChain(): Promise<{ valid: boolean; brokenAt?: string; checked: number }> {
    this.logger.log('Starting nightly audit hash-chain validation (streaming)');

    let prevHash = '0'.repeat(64);
    let checked = 0;
    let brokenAt: string | undefined;

    const qb = this.ds
      .createQueryBuilder()
      .select(['id', 'action_type', 'target_type', 'target_id', 'app_recorded_at', 'hash_chain'])
      .from('admin_action_logs', 'a')
      .orderBy('a.app_recorded_at', 'ASC')
      .addOrderBy('a.id', 'ASC');

    const stream = await qb.stream();
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.on('data', (row: any) => {
        if (brokenAt) return;   // short-circuit after first break

        const expectedHash = AdminAuditService.computeChainHash(
          prevHash,
          {
            actionType: row.action_type,
            targetType: row.target_type ?? undefined,
            targetId: row.target_id ?? undefined,
            adminId: '',   // not in the chain formula
            justification: '',
          } as AuditActionParams,
          new Date(row.app_recorded_at),
        );

        if (row.hash_chain !== expectedHash) {
          this.logger.error(`Hash chain broken at entry ${row.id}`);
          this.alerts.fire({
            channel: 'audit_tamper_detection',
            severity: 'critical',
            message: `AUDIT LOG TAMPER DETECTED at entry ${row.id}`,
            context: { entryId: row.id, expected: expectedHash, actual: row.hash_chain },
          }).catch(() => undefined);
          brokenAt = row.id;
          return;
        }

        prevHash = row.hash_chain;
        checked++;
      });
    });

    if (brokenAt) return { valid: false, brokenAt, checked };

    this.logger.log(`Audit hash-chain valid: ${checked} entries checked`);
    return { valid: true, checked };
  }

  private async getLastHash(): Promise<string> {
    // v11 (GAP-1): order by app_recorded_at for consistency with the writer's
    // FOR UPDATE select; results are identical to created_at ordering in practice.
    const [row] = await this.ds.query<{ hash_chain: string }[]>(
      `SELECT hash_chain FROM admin_action_logs ORDER BY app_recorded_at DESC, id DESC LIMIT 1`,
    );
    return row?.hash_chain ?? '0'.repeat(64);
  }

  /**
   * v11 (GAP-1 fix): the canonical chain-hash formula. Used by BOTH the
   * writer (log()) and the validator (validateHashChain()) so they always
   * agree. The app-side timestamp is part of the chain input and is
   * persisted as `app_recorded_at` so the validator can reproduce it.
   *
   * Static method so the validator can call it without spinning up the
   * full DataSource dependency.
   */
  static computeChainHash(prevHash: string, params: AuditActionParams, appRecordedAt: Date): string {
    return createHash('sha256')
      .update(
        prevHash + '|' +
        (params.actionType ?? '') + '|' +
        (params.targetId ?? '') + '|' +
        (params.targetType ?? '') + '|' +
        appRecordedAt.toISOString(),
      )
      .digest('hex');
  }
}
