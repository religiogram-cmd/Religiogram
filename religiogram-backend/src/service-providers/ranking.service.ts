import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProviderEntity, ProviderStatus } from './entities/provider.entity';

/**
 * RankingService — computes and refreshes `providers.ranking_score`.
 *
 * ── Formula (v1) ────────────────────────────────────────────────────────
 *
 *   score =
 *       20 * (status == approved)                          // gatekeep
 *     + 10 * (is_verified)                                 // KYC bonus
 *     + 20 * profile_completeness                          // 0..1
 *     + 20 * (rating_avg / 5)                              // rating normalised
 *     +  3 * log10(rating_count + 1) * 5                   // review volume
 *     +  5 * log10(completed_bookings_count + 1) * 5       // booking history
 *     +  5 * (is_online)                                   // real-time boost
 *     +  5 * recent_activity_score                         // 0..1 with decay
 *     +  0..15 experience_bonus                            // years × factor
 *     +  0..10 trending_specialisation_bonus               // future
 *
 *   Rough range: 0..150. Marketplace sorts by this DESC.
 *
 * ── Signals we DON'T yet track ──────────────────────────────────────────
 *   - response_rate       — needs message SLA data
 *   - repeat_customer_pct — needs booking-user history join
 *
 *   Column reserved (migration 071), formula stays stable when we add them.
 *
 * ── When we recompute ──────────────────────────────────────────────────
 *   1. On explicit signal changes via `bump(providerId)` — called by
 *      ReviewsService.updateRating, BookingsService on complete,
 *      admin-verification approve.
 *   2. Nightly cron at 03:00 UTC (`@Cron`) — sweeps all approved rows so
 *      time-decay stays fresh even for providers with no activity.
 *   3. On demand via `POST /admin/ranking/recompute-all`.
 *
 * ── Performance ─────────────────────────────────────────────────────────
 *   Per-row compute is a single SELECT + UPDATE. Full sweep touches every
 *   approved row (small integer number today; consider batching at 10k+).
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Recompute one provider's score. Idempotent, safe to call at any time. */
  async bump(providerId: string): Promise<number> {
    const p = await this.providers.findOne({ where: { id: providerId } });
    if (!p) return 0;
    const score = this.computeScore(p);
    await this.providers.update({ id: providerId }, { rankingScore: score.toFixed(2) });
    return score;
  }

  /** Full sweep — used by cron and admin trigger. Returns count updated.
   *
   * Rewritten from N+1 (SELECT + N UPDATEs) to a single UPDATE ... FROM
   * that recomputes ranking_score in-database for every approved provider
   * in one round-trip. Mirrors the fields used by computeScore() so the
   * batch path stays in lock-step with the per-provider bump() path.
   *
   * Formula (must mirror computeScore):
   *   20 · gatekeep(approved)
   * + 10 · is_verified
   * + 20 · profile_completeness (0..1)
   * + min(20, rating_avg/5 · 20)               when rating_avg > 0
   * + min(15, log10(rating_count + 1) · 5)     when rating_count > 0
   * + min(25, log10(completed_bookings_count + 1) · 5) when > 0
   * +  5 · is_online
   * +  5 · exp_decay(last_activity_at, 24h half-life)
   * + (min(20, experience_years) / 20) · 15   when > 0
   *
   * Weights per profileCompleteness():
   *   fullName=1, city=1, bio(>=40)=1.5, languages(any)=1,
   *   experience_years>0=1, pan_s3_key=1, selfie_s3_key=1  → total 7.5
   */
  async recomputeAll(): Promise<{ updated: number; ms: number }> {
    const started = Date.now();
    const result = await this.ds.query(
      `
      WITH scored AS (
        SELECT
          id,
          ROUND(
            (
              20
              + (CASE WHEN is_verified THEN 10 ELSE 0 END)
              + 20 * (
                (
                    (CASE WHEN COALESCE(full_name, '') <> '' THEN 1 ELSE 0 END)
                  + (CASE WHEN COALESCE(city, '') <> '' THEN 1 ELSE 0 END)
                  + (CASE WHEN COALESCE(LENGTH(bio), 0) >= 40 THEN 1.5 ELSE 0 END)
                  + (CASE WHEN languages IS NOT NULL AND array_length(languages, 1) > 0 THEN 1 ELSE 0 END)
                  + (CASE WHEN experience_years IS NOT NULL AND experience_years > 0 THEN 1 ELSE 0 END)
                  + (CASE WHEN COALESCE(pan_s3_key, '') <> '' THEN 1 ELSE 0 END)
                  + (CASE WHEN COALESCE(selfie_s3_key, '') <> '' THEN 1 ELSE 0 END)
                ) / 7.5
              )
              + (CASE WHEN COALESCE(rating_avg, 0) > 0
                      THEN LEAST(20.0, (COALESCE(rating_avg, 0) / 5.0) * 20.0)
                      ELSE 0 END)
              + (CASE WHEN COALESCE(rating_count, 0) > 0
                      THEN LEAST(15.0, LOG(10, COALESCE(rating_count, 0) + 1) * 5.0)
                      ELSE 0 END)
              + (CASE WHEN COALESCE(completed_bookings_count, 0) > 0
                      THEN LEAST(25.0, LOG(10, COALESCE(completed_bookings_count, 0) + 1) * 5.0)
                      ELSE 0 END)
              + (CASE WHEN is_online THEN 5 ELSE 0 END)
              + 5 * (
                CASE WHEN last_activity_at IS NULL THEN 0
                     ELSE GREATEST(0.0,
                       POWER(0.5, EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 3600.0 / 24.0)
                     )
                END
              )
              + (CASE WHEN COALESCE(experience_years, 0) > 0
                      THEN (LEAST(20, experience_years)::numeric / 20.0) * 15.0
                      ELSE 0 END)
            )::numeric, 2
          ) AS new_score
        FROM providers
        WHERE status = 'approved'
      )
      UPDATE providers p
      SET ranking_score = s.new_score
      FROM scored s
      WHERE p.id = s.id
      `,
    );
    // `result` shape varies by driver; TypeORM postgres driver returns
    // [rows, affectedRows]. Fall back to a count query if the shape differs.
    let updated = 0;
    if (Array.isArray(result) && typeof result[1] === 'number') {
      updated = result[1];
    } else if (result && typeof (result as any).affected === 'number') {
      updated = (result as any).affected;
    } else {
      updated = await this.providers.count({ where: { status: ProviderStatus.Approved } });
    }
    const ms = Date.now() - started;
    this.logger.log(`recomputeAll: updated ${updated} providers in ${ms}ms (single-statement)`);
    return { updated, ms };
  }

  /** The score formula. Pure — takes a snapshot of the row, returns a number. */
  computeScore(p: ProviderEntity): number {
    let score = 0;

    // 1. Gatekeep — must be approved
    if (p.status === ProviderStatus.Approved) score += 20;

    // 2. Verified identity (KYC docs + admin approval flag)
    if (p.isVerified) score += 10;

    // 3. Profile completeness — how much of the profile is filled
    score += 20 * this.profileCompleteness(p);

    // 4. Rating quality (0..20)
    const ratingAvg = p.ratingAvg != null ? parseFloat(p.ratingAvg as string) : 0;
    if (ratingAvg > 0) score += Math.min(20, (ratingAvg / 5) * 20);

    // 5. Review volume — log-scaled so early reviews matter, later reviews
    //    have diminishing returns
    if (p.ratingCount > 0) {
      score += Math.min(15, Math.log10(p.ratingCount + 1) * 5);
    }

    // 6. Completed bookings — same log shape as reviews
    if (p.completedBookingsCount > 0) {
      score += Math.min(25, Math.log10(p.completedBookingsCount + 1) * 5);
    }

    // 7. Online right now — small real-time boost
    if (p.isOnline) score += 5;

    // 8. Recent activity — full 5pts if active in last 24h, exponential decay
    //    to 0 by 30 days
    score += 5 * this.recentActivityScore(p.lastActivityAt);

    // 9. Overall experience bonus — cap at 15 for 20+ years
    if (p.experienceYears != null && p.experienceYears > 0) {
      const yrs = Math.min(20, p.experienceYears);
      score += (yrs / 20) * 15;
    }

    return Math.round(score * 100) / 100; // 2 decimal places
  }

  /**
   * 0..1 fraction of profile fields that are set. Weights the fields a
   * devotee actually sees on a profile card the most.
   */
  private profileCompleteness(p: ProviderEntity): number {
    const checks: Array<[boolean, number]> = [
      [!!p.fullName && p.fullName.length > 0, 1],
      [!!p.city     && p.city.length > 0,     1],
      [!!p.bio      && (p.bio ?? '').length >= 40, 1.5],
      [Array.isArray(p.languages) && p.languages.length > 0, 1],
      [p.experienceYears != null && p.experienceYears > 0,   1],
      [!!p.panS3Key,    1],
      [!!p.selfieS3Key, 1],
    ];
    const total = checks.reduce((s, [_, w]) => s + w, 0);
    const got   = checks.reduce((s, [ok, w]) => s + (ok ? w : 0), 0);
    return total === 0 ? 0 : got / total;
  }

  /**
   * Exponential decay based on hours since last activity:
   *   0h  → 1.0
   *   24h → ~0.5
   *   7d  → ~0.05
   *   30d → 0
   */
  private recentActivityScore(when: Date | null): number {
    if (!when) return 0;
    const hoursAgo = (Date.now() - when.getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 0) return 1;
    // half-life at 24h
    return Math.max(0, Math.pow(0.5, hoursAgo / 24));
  }

  /**
   * Nightly recompute — 03:00 UTC keeps time-decay in the score fresh even
   * for providers with no explicit signal changes.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC' })
  async nightlyRecompute(): Promise<void> {
    try {
      const { updated, ms } = await this.recomputeAll();
      this.logger.log(`nightly recompute complete: ${updated} in ${ms}ms`);
    } catch (err) {
      this.logger.error('nightly recompute failed', err as any);
    }
  }
}
