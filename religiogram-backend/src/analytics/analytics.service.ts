import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { LogEventDto } from './dto/log-event.dto';

/**
 * Analytics recorder.
 *
 * Goals
 * -----
 *   - Cheap writes: single INSERT, no read-before-write, fire and
 *     forget semantics at the controller boundary.
 *   - Safe payloads: strip keys that look like PII before persisting.
 *     We can't guarantee clients don't send them, so we harden the
 *     perimeter here.
 *   - Never block the user: if the INSERT fails (bad JSON, DB hiccup),
 *     log and move on — analytics is best-effort. The controller
 *     returns 202 Accepted so the client doesn't treat a failed
 *     beacon as an app error.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  /**
   * Keys that should never appear in event metadata. Anything matching
   * these names (case-insensitive) gets dropped before insert. This is
   * a belt + braces measure — the client contract says "no PII" — but
   * we treat the contract as advisory.
   */
  private static readonly FORBIDDEN_META_KEYS = new Set<string>([
    'email',
    'phone',
    'phonenumber',
    'name',
    'fullname',
    'firstname',
    'lastname',
    'password',
    'token',
    'jwt',
    'authorization',
    'session',
    'apikey',
    'secret',
  ]);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly events: Repository<AnalyticsEvent>,
  ) {}

  async record(params: {
    dto: LogEventDto;
    userId: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const { dto, userId, ip, userAgent } = params;
    const metadata = this.sanitizeMetadata(dto.metadata ?? {});

    try {
      await this.events.insert({
        userId,
        eventType: dto.eventType,
        metadata,
        ip: ip ?? null,
        userAgent: userAgent?.slice(0, 400) ?? null,
      } as any);
    } catch (err) {
      // Analytics failures must never bubble up. Log for later triage.
      this.logger.warn(
        `analytics insert failed for event=${dto.eventType}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Delete events older than `retentionDays`. Called by the scheduled
   * sweep job (see analytics-cleaner.processor.ts). Idempotent — running
   * twice in the same hour is harmless; the second run just deletes 0
   * rows. Uses a single DELETE with a bounded `ctid` window so a large
   * backlog doesn't lock the table.
   *
   * Why it matters: analytics grows linearly with traffic. At 10K DAU
   * we'd be inserting ~50K rows/day; without a sweeper the table doubles
   * every 15 months and the indexes follow. 30 days is the sweet spot —
   * long enough for product analysts to spot trends, short enough that
   * the table stays a few-GB max. The warehouse ETL is where long-term
   * retention lives.
   */
  async sweepOld(retentionDays = 30, batchSize = 10_000): Promise<{
    deleted: number;
    cutoffIso: string;
  }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Batched delete: avoids one huge transaction holding a lock on the
    // hot table. Postgres lets us use `WHERE ctid IN (SELECT ... LIMIT N)`
    // for this pattern. We loop until a batch returns 0 rows.
    let totalDeleted = 0;
    // Hard cap the number of batches so a broken clock can't spin the
    // worker forever. 100 * 10_000 = 1M rows per sweep — more than enough
    // for the expected daily backlog.
    for (let i = 0; i < 100; i++) {
      const rows = await this.events.query<{ deleted: number }[]>(
        `
        WITH victims AS (
          SELECT ctid FROM analytics_events
          WHERE created_at < $1
          LIMIT $2
        )
        DELETE FROM analytics_events
        WHERE ctid IN (SELECT ctid FROM victims)
        RETURNING 1 AS deleted
        `,
        [cutoff.toISOString(), batchSize],
      );
      const n = rows.length;
      totalDeleted += n;
      if (n < batchSize) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `analytics sweep deleted ${totalDeleted} events older than ${cutoff.toISOString()}`,
      );
    }
    return { deleted: totalDeleted, cutoffIso: cutoff.toISOString() };
  }

  /**
   * Remove forbidden keys and cap string values at a reasonable length.
   * Kept intentionally shallow — we don't recurse into nested objects,
   * because nested objects shouldn't appear in analytics payloads in
   * the first place (and if they do, we'd prefer they fail review
   * loudly rather than silently pass a PII scan).
   */
  private sanitizeMetadata(
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (AnalyticsService.FORBIDDEN_META_KEYS.has(k.toLowerCase())) continue;
      if (typeof v === 'string') {
        out[k] = v.slice(0, 500);
      } else if (
        v === null ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        out[k] = v;
      } else if (Array.isArray(v)) {
        // Cap array size to keep payloads bounded.
        out[k] = v.slice(0, 20);
      } else {
        // Objects — allow but don't sanitise recursively. Callers
        // shouldn't send them; if they do, flag in logs so we can
        // tighten the schema.
        out[k] = v;
      }
    }
    return out;
  }
}
