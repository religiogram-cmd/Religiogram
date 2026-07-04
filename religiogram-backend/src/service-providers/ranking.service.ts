import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  /** Recompute one provider's score. Idempotent, safe to call at any time. */
  async bump(providerId: string): Promise<number> {
    const p = await this.providers.findOne({ where: { id: providerId } });
    if (!p) return 0;
    const score = this.computeScore(p);
    await this.providers.update({ id: providerId }, { rankingScore: score.toFixed(2) });
    return score;
  }

  /** Full sweep — used by cron and admin trigger. Returns count updated. */
  async recomputeAll(): Promise<{ updated: number; ms: number }> {
    const started = Date.now();
    // Only rank approved providers — draft/pending/rejected/suspended stay
    // at 0. Keeps the marketplace list clean and the sweep small.
    const rows = await this.providers.find({ where: { status: ProviderStatus.Approved } });
    for (const p of rows) {
      const score = this.computeScore(p);
      await this.providers.update({ id: p.id }, { rankingScore: score.toFixed(2) });
    }
    const ms = Date.now() - started;
    this.logger.log(`recomputeAll: updated ${rows.length} providers in ${ms}ms`);
    return { updated: rows.length, ms };
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
