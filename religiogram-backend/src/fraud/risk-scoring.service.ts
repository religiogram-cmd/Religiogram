import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { AlertsService } from '../common/alerts/alerts.service';

export enum RiskAction {
  ALLOW          = 'allow',
  STEP_UP_AUTH   = 'step_up_auth',
  HOLD_FOR_REVIEW = 'hold_for_review',
  BLOCK          = 'block',
}

export interface RiskSignal {
  name: string;
  weight: number;
  detail: string;
}

export interface RiskAssessment {
  userId: string;
  score: number;          // 0–100
  action: RiskAction;
  signals: RiskSignal[];
  computedAt: Date;
}

const SCORE_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 80,
};

@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly redis: RedisService,
    private readonly alerts: AlertsService,
  ) {}

  // ── Main scoring entry point ───────────────────────────────────────────
  async assess(params: {
    userId: string;
    ipAddress: string;
    deviceId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<RiskAssessment> {
    const signals: RiskSignal[] = [];

    // Gather signals concurrently
    const [
      ipVelocity,
      bookingVelocity,
      walletVelocity,
      accountAge,
      priorSignals,
      deviceMatch,
    ] = await Promise.all([
      this.checkIpVelocity(params.ipAddress),
      this.checkBookingVelocity(params.userId),
      this.checkWalletVelocity(params.userId),
      this.checkAccountAge(params.userId),
      this.getPriorScore(params.userId),
      params.deviceId ? this.checkDeviceFingerprint(params.userId, params.deviceId) : Promise.resolve(null),
    ]);

    if (ipVelocity) signals.push(ipVelocity);
    if (bookingVelocity) signals.push(bookingVelocity);
    if (walletVelocity) signals.push(walletVelocity);
    if (accountAge) signals.push(accountAge);
    if (deviceMatch) signals.push(deviceMatch);

    // Include existing score as a partial signal (decayed over time)
    let score = signals.reduce((acc, s) => acc + s.weight, 0);
    if (priorSignals > 0) score = Math.min(100, score + Math.floor(priorSignals * 0.3));

    score = Math.min(100, Math.max(0, score));
    const action = this.scoreToAction(score);

    const assessment: RiskAssessment = {
      userId: params.userId,
      score,
      action,
      signals,
      computedAt: new Date(),
    };

    // Persist updated score
    await this.persistScore(params.userId, score, params.action, signals);

    // Alert on critical scores
    if (score >= SCORE_THRESHOLDS.HIGH) {
      this.logger.warn(`High-risk action detected: userId=${params.userId} score=${score} action=${params.action}`);
      if (score >= 90) {
        await this.alerts.fire({
          channel: 'fraud_critical',
          severity: 'critical',
          message: `Critical fraud risk: userId=${params.userId} score=${score}`,
          context: { ...params, score, signals },
        });
      }
    }

    return assessment;
  }

  // ── Signal checkers ────────────────────────────────────────────────────
  private async checkIpVelocity(ip: string): Promise<RiskSignal | null> {
    const key = `rg:risk:ip:${ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);

    if (count > 50) return { name: 'ip_high_velocity', weight: 25, detail: `${count} requests/hr from ${ip}` };
    if (count > 20) return { name: 'ip_medium_velocity', weight: 15, detail: `${count} requests/hr from ${ip}` };
    return null;
  }

  private async checkBookingVelocity(userId: string): Promise<RiskSignal | null> {
    const key = `rg:risk:booking:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);

    if (count > 10) return { name: 'booking_velocity_high', weight: 30, detail: `${count} bookings/hr` };
    if (count > 5)  return { name: 'booking_velocity_medium', weight: 15, detail: `${count} bookings/hr` };
    return null;
  }

  private async checkWalletVelocity(userId: string): Promise<RiskSignal | null> {
    const key = `rg:risk:wallet:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);

    if (count > 5) return { name: 'wallet_topup_velocity', weight: 35, detail: `${count} topups/hr` };
    return null;
  }

  private async checkAccountAge(userId: string): Promise<RiskSignal | null> {
    const [row] = await this.ds.query<{ age_hours: number }[]>(
      `SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 3600 AS age_hours FROM users WHERE id = $1`,
      [userId],
    );
    if (!row) return null;
    if (row.age_hours < 24) return { name: 'new_account', weight: 20, detail: `Account age: ${Math.round(row.age_hours)}h` };
    return null;
  }

  private async checkDeviceFingerprint(userId: string, deviceId: string): Promise<RiskSignal | null> {
    // Check how many user accounts share this device fingerprint
    const [row] = await this.ds.query<{ count: number }[]>(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM user_devices
       WHERE device_id = $1 AND user_id != $2 AND status = 'active'`,
      [deviceId, userId],
    );
    if (!row) return null;
    if (row.count >= 3) return { name: 'device_shared_multiple', weight: 50, detail: `Device shared by ${row.count + 1} accounts` };
    if (row.count >= 1) return { name: 'device_shared', weight: 20, detail: `Device shared by ${row.count + 1} accounts` };
    return null;
  }

  private async getPriorScore(userId: string): Promise<number> {
    const [row] = await this.ds.query<{ score: number }[]>(
      `SELECT score FROM user_risk_scores WHERE user_id = $1`,
      [userId],
    );
    return row?.score ?? 0;
  }

  private scoreToAction(score: number): RiskAction {
    if (score <= SCORE_THRESHOLDS.LOW)    return RiskAction.ALLOW;
    if (score <= SCORE_THRESHOLDS.MEDIUM) return RiskAction.STEP_UP_AUTH;
    if (score <= SCORE_THRESHOLDS.HIGH)   return RiskAction.HOLD_FOR_REVIEW;
    return RiskAction.BLOCK;
  }

  private async persistScore(userId: string, score: number, event: string, signals: RiskSignal[]): Promise<void> {
    await this.ds.query(`
      INSERT INTO user_risk_scores (user_id, score, last_event, last_signals, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (user_id) DO UPDATE
        SET score = GREATEST(user_risk_scores.score, $2),
            last_event = $3,
            last_signals = $4,
            updated_at = now()
    `, [userId, score, event, JSON.stringify(signals)]);
  }

  // ── Decay scores nightly (scores drop 10 pts per clean 24h) ───────────
  async decayScores(): Promise<void> {
    await this.ds.query(`
      UPDATE user_risk_scores
      SET score = GREATEST(0, score - 10),
          decayed_at = now()
      WHERE decayed_at < now() - INTERVAL '24 hours'
        AND score > 0
    `);
  }
}
