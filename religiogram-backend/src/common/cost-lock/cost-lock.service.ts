import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { RedisService } from '../../redis/redis.service';

/**
 * CostLockService  — P0-5 from the Minimal-Cost Master Plan
 *
 * Tracks the total daily AI and OTP spend (in rupees, approximated from
 * token counts and message counts) against hard env-var ceilings.
 *
 * When a ceiling is breached:
 *   - The relevant service degrades gracefully (callers must check).
 *   - A one-time-per-day Telegram alert is fired so the founder is paged.
 *   - All subsequent calls in that calendar day return locked=true.
 *
 * Redis keys (UTC calendar day):
 *   costlock:ai:{YYYY-MM-DD}    => cumulative AI spend in paise (int)
 *   costlock:otp:{YYYY-MM-DD}   => cumulative OTP messages sent (int)
 *   costlock:ai:alerted:{date}  => "1" — suppresses duplicate Telegram alerts
 *   costlock:otp:alerted:{date} => "1"
 *
 * Rupee cost approximations used:
 *   Gemini Flash:  Rs 0.006 per 1K input tokens  (~ $0.075 / 1M * 83 FX)
 *   Gemini Pro:    Rs 0.025 per 1K input tokens  (~ $0.35 / 1M * 83 FX * safety buffer)
 *   WhatsApp OTP:  Rs 0.12 per message
 *   SMS fallback:  Rs 0.50 per message
 */
@Injectable()
export class CostLockService {
  private readonly logger = new Logger(CostLockService.name);

  private readonly AI_DAILY_CAP_RS: number;
  private readonly OTP_DAILY_CAP_RS: number;
  private readonly TG_TOKEN?: string;
  private readonly TG_CHAT?: string;

  // Paise per 1000 tokens
  private readonly FLASH_RS_PER_1K = 0.006;
  private readonly PRO_RS_PER_1K   = 0.025;
  // Rupees per OTP/SMS
  private readonly WHATSAPP_RS = 0.12;
  private readonly SMS_RS      = 0.50;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.AI_DAILY_CAP_RS  = this.config.get<number>('COST_LOCK_AI_DAILY_RUPEES',  2000);
    this.OTP_DAILY_CAP_RS = this.config.get<number>('COST_LOCK_OTP_DAILY_RUPEES', 500);
    this.TG_TOKEN  = this.config.get<string>('TELEGRAM_ALERT_BOT_TOKEN');
    this.TG_CHAT   = this.config.get<string>('TELEGRAM_ALERT_CHAT_ID');
  }

  /** Record Gemini Flash token usage and check if AI cap is breached. */
  async recordFlashTokens(inputTokens: number): Promise<{ locked: boolean; spentRs: number }> {
    const cost = (inputTokens / 1000) * this.FLASH_RS_PER_1K;
    return this.addAiSpend(cost);
  }

  /** Record Gemini Pro token usage and check if AI cap is breached. */
  async recordProTokens(inputTokens: number): Promise<{ locked: boolean; spentRs: number }> {
    const cost = (inputTokens / 1000) * this.PRO_RS_PER_1K;
    return this.addAiSpend(cost);
  }

  /**
   * Check whether AI spend is already at or beyond today's cap without adding.
   * Used by the AI orchestrator before even starting a Gemini call.
   */
  async isAiLocked(): Promise<boolean> {
    const { spentRs } = await this.getAiSpend();
    return spentRs >= this.AI_DAILY_CAP_RS;
  }

  /** Record a WhatsApp OTP send and check if OTP cap is breached. */
  async recordWhatsAppOtp(): Promise<{ locked: boolean; spentRs: number }> {
    return this.addOtpSpend(this.WHATSAPP_RS);
  }

  /** Record an SMS fallback send and check if OTP cap is breached. */
  async recordSmsFallback(): Promise<{ locked: boolean; spentRs: number }> {
    return this.addOtpSpend(this.SMS_RS);
  }

  /** Check whether OTP spend is already locked for today. */
  async isOtpLocked(): Promise<boolean> {
    const { spentRs } = await this.getOtpSpend();
    return spentRs >= this.OTP_DAILY_CAP_RS;
  }

  /** Return current daily AI spend in rupees. */
  async getAiSpend(): Promise<{ spentRs: number; capRs: number }> {
    const raw = await this.redis.get(this.aiKey());
    const paise = raw ? parseInt(raw, 10) : 0;
    return { spentRs: paise / 100, capRs: this.AI_DAILY_CAP_RS };
  }

  /** Return current daily OTP spend in rupees. */
  async getOtpSpend(): Promise<{ spentRs: number; capRs: number }> {
    const raw = await this.redis.get(this.otpKey());
    const paise = raw ? parseInt(raw, 10) : 0;
    return { spentRs: paise / 100, capRs: this.OTP_DAILY_CAP_RS };
  }

  /* ── private helpers ──────────────────────────────────────────── */

  private async addAiSpend(rupees: number): Promise<{ locked: boolean; spentRs: number }> {
    const paise = Math.ceil(rupees * 100);
    const key = this.aiKey();
    const total = await this.incrWithTtl(key, paise);
    const spentRs = total / 100;
    const locked  = spentRs >= this.AI_DAILY_CAP_RS;
    if (locked) {
      await this.alertOnce('ai', `AI spend Rs ${spentRs.toFixed(2)} >= cap Rs ${this.AI_DAILY_CAP_RS}`);
    }
    return { locked, spentRs };
  }

  private async addOtpSpend(rupees: number): Promise<{ locked: boolean; spentRs: number }> {
    const paise = Math.ceil(rupees * 100);
    const key = this.otpKey();
    const total = await this.incrWithTtl(key, paise);
    const spentRs = total / 100;
    const locked  = spentRs >= this.OTP_DAILY_CAP_RS;
    if (locked) {
      await this.alertOnce('otp', `OTP spend Rs ${spentRs.toFixed(2)} >= cap Rs ${this.OTP_DAILY_CAP_RS}`);
    }
    return { locked, spentRs };
  }

  /** INCRBY the key, set midnight-UTC TTL on first write, return new total (paise). */
  private async incrWithTtl(key: string, paise: number): Promise<number> {
    const result = await this.redis.incrby(key, paise);
    if (result === paise) {
      // First write today — set TTL to next midnight UTC
      await this.redis.expire(key, this.secondsUntilMidnight());
    }
    return result;
  }

  /** Fire a Telegram message at most once per day per category. */
  private async alertOnce(category: 'ai' | 'otp', message: string): Promise<void> {
    const alertKey = `costlock:${category}:alerted:${this.today()}`;
    const alreadySent = await this.redis.get(alertKey);
    if (alreadySent) return;

    await this.redis.set(alertKey, '1', 'EX', this.secondsUntilMidnight());

    const text =
      `[ReligioGram COST-LOCK] ${message}\n` +
      `Service degraded to free fallbacks until midnight UTC.\n` +
      `Check COST_LOCK_${category.toUpperCase()}_DAILY_RUPEES env var to adjust.`;

    this.logger.warn(text);

    if (this.TG_TOKEN && this.TG_CHAT) {
      const url = `https://api.telegram.org/bot${this.TG_TOKEN}/sendMessage`;
      this.http.post(url, { chat_id: this.TG_CHAT, text }).subscribe({
        error: (e: Error) => this.logger.warn(`Telegram alert failed: ${e.message}`),
      });
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private aiKey():  string { return `costlock:ai:${this.today()}`; }
  private otpKey(): string { return `costlock:otp:${this.today()}`; }

  private secondsUntilMidnight(): number {
    const now = Date.now();
    const d = new Date();
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return Math.ceil((midnight - now) / 1000);
  }
}
