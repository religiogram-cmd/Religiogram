import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from '../common/alerts/alerts.service';

const GRACE_TTL_SECONDS = 90;
const SESSION_LOCK_TTL  = 12 * 60 * 60;
const GRACE_KEY = (sessionId: string, userId: string) => `session:grace:${sessionId}:${userId}`;
const SESSION_ACTIVE_KEY = (sessionId: string) => `session:active:${sessionId}`;

export type DisconnectSide = 'user' | 'provider';

export interface GraceState {
  sessionId: string;
  disconnectedSide: DisconnectSide;
  disconnectedAt: number;
  graceExpiresAt: number;
  billedSeconds: number;
}

@Injectable()
export class SessionGraceService {
  private readonly logger = new Logger(SessionGraceService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly redis: RedisService,
    private readonly alerts: AlertsService,
  ) {}

  async startGrace(params: {
    sessionId: string;
    userId: string;
    side: DisconnectSide;
    billedSeconds: number;
  }): Promise<void> {
    const key = GRACE_KEY(params.sessionId, params.userId);
    const state: GraceState = {
      sessionId: params.sessionId,
      disconnectedSide: params.side,
      disconnectedAt: Date.now(),
      graceExpiresAt: Date.now() + GRACE_TTL_SECONDS * 1000,
      billedSeconds: params.billedSeconds,
    };
    await this.redis.setEx(key, GRACE_TTL_SECONDS, JSON.stringify(state));
    this.logger.log(`Grace started: session=${params.sessionId} side=${params.side} TTL=${GRACE_TTL_SECONDS}s`);
  }

  async cancelGrace(sessionId: string, userId: string): Promise<boolean> {
    const key = GRACE_KEY(sessionId, userId);
    const deleted = await this.redis.del(key);
    if (deleted) this.logger.log(`Grace cancelled (reconnect): session=${sessionId}`);
    return deleted > 0;
  }

  async getGraceState(sessionId: string, userId: string): Promise<GraceState | null> {
    const raw = await this.redis.get(GRACE_KEY(sessionId, userId));
    if (!raw) return null;
    return JSON.parse(raw) as GraceState;
  }

  async handleGraceExpiry(sessionId: string, billedSeconds: number, side: DisconnectSide): Promise<void> {
    this.logger.log(`Grace expired: session=${sessionId} side=${side} billedSeconds=${billedSeconds}`);
    try {
      await this.ds.query(`
        UPDATE consultation_sessions
        SET status = 'ended',
            end_reason = $1,
            ended_at   = now(),
            billed_seconds = $2
        WHERE session_id = $3 AND status IN ('active', 'grace')
      `, [`grace_expired_${side}`, billedSeconds, sessionId]);
      await this.finaliseSessionBilling(sessionId, billedSeconds);
    } catch (err) {
      this.logger.error(`Grace expiry handler failed for session ${sessionId}`, err);
      await this.alerts.fire({
        channel: 'session_billing',
        severity: 'critical',
        message: `Session grace expiry finalisation failed: ${sessionId}`,
        error: err as Error,
      });
    }
  }

  async acquireSessionLock(sessionId: string): Promise<boolean> {
    const key = SESSION_ACTIVE_KEY(sessionId);
    return this.redis.setIfNotExists(key, String(Date.now()), SESSION_LOCK_TTL);
  }

  async releaseSessionLock(sessionId: string): Promise<void> {
    await this.redis.del(SESSION_ACTIVE_KEY(sessionId));
  }

  async checkSessionBalance(sessionId: string, userId: string): Promise<{
    canContinue: boolean;
    remainingSeconds: number;
    warning: boolean;
  }> {
    const [session] = await this.ds.query<{ rate_per_minute: number }[]>(
      `SELECT rate_per_minute FROM consultation_sessions WHERE session_id = $1`,
      [sessionId],
    );
    if (!session) return { canContinue: false, remainingSeconds: 0, warning: true };

    const [bal] = await this.ds.query<{ available: number }[]>(
      `SELECT wb.available
       FROM wallets w
       JOIN wallet_balances wb ON wb.wallet_id = w.id
       WHERE w.owner_id = $1 AND w.owner_type = 'user'`,
      [userId],
    );
    if (!bal) return { canContinue: false, remainingSeconds: 0, warning: true };

    const balance = Number(bal.available);
    const ratePerSecond = Number(session.rate_per_minute) / 60;
    const remainingSeconds = ratePerSecond > 0 ? Math.floor(balance / ratePerSecond) : 9999;

    return {
      canContinue: balance > 0,
      remainingSeconds,
      warning: remainingSeconds < 120,
    };
  }

  @Cron('*/15 * * * * *', { name: 'session-grace-sweeper' })
  async sweepExpiredGraces(): Promise<void> {
    const lease = await this.redis.setIfNotExists('session:grace:sweep-lease', String(Date.now()), 10);
    if (!lease) return;

    const now = Date.now();
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'session:grace:*', 'COUNT', 200);
      cursor = next;
      for (const rawKey of keys) {
        const logical = rawKey.replace(/^[^:]+:/, '');
        const raw = await this.redis.get(logical);
        if (!raw) continue;
        let state: GraceState;
        try {
          state = JSON.parse(raw) as GraceState;
        } catch {
          continue;
        }
        if (state.graceExpiresAt > now) continue;

        const dropped = await this.redis.del(logical);
        if (dropped > 0) {
          await this.handleGraceExpiry(state.sessionId, state.billedSeconds, state.disconnectedSide);
        }
      }
    } while (cursor !== '0');
  }

  private async finaliseSessionBilling(sessionId: string, billedSeconds: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO consultation_events (session_id, event_type, payload_json)
      VALUES ($1, 'billing_finalise', $2)
    `, [sessionId, JSON.stringify({ billedSeconds, trigger: 'grace_expiry' })]);
  }
}
