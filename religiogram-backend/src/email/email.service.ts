/**
 * EmailService — transactional email via Resend
 *
 * All methods are fire-and-forget with structured error logging.
 * Never throws — a failed email must NEVER roll back a financial transaction.
 *
 * Templates live in src/email/templates/ as plain HTML strings.
 * They use {{VAR}} placeholders replaced at call time.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface BookingConfirmationData {
  userName: string;
  providerName: string;
  serviceType: string;
  scheduledAt: Date;
  amountInr: number;
  bookingId: string;
  cancelUrl: string;
}

export interface PayoutNotificationData {
  providerName: string;
  amountInr: number;
  utrNumber: string;
  bankLast4: string;
  payoutDate: Date;
}

export interface KycStatusData {
  userName: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface OtpEmailData {
  userName: string;
  otp: string;
  expiresMinutes: number;
}

export interface WelcomeData {
  userName: string;
  role: 'seeker' | 'provider';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly enabled: boolean;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('email.resendApiKey', '');
    this.from    = config.get<string>('email.from', 'ReligioGram <noreply@religiogram.app>');
    this.appUrl  = config.get<string>('app.url', 'https://religiogram.app');
    this.enabled = !!apiKey && apiKey !== 'disabled';
    this.resend  = new Resend(apiKey || 're_placeholder');

    if (!this.enabled) {
      this.logger.warn('Email service disabled — set RESEND_API_KEY to enable');
    }
  }

  // ── private send helper ────────────────────────────────────────────────────

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    tags?: { name: string; value: string }[];
  }): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[email-stub] To: ${opts.to} | ${opts.subject}`);
      return;
    }
    try {
      const { error } = await this.resend.emails.send({
        from:    this.from,
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
        tags:    opts.tags,
      });
      if (error) {
        this.logger.error(`Email send failed: ${JSON.stringify(error)} → to:${opts.to}`);
      } else {
        this.logger.log(`Email sent → ${opts.to} | ${opts.subject}`);
      }
    } catch (err) {
      this.logger.error(`Email exception: ${(err as Error).message} → to:${opts.to}`);
    }
  }

  private fill(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
      template,
    );
  }

  // ── public methods ──────────────────────────────────────────────────────────

  async sendBookingConfirmation(to: string, data: BookingConfirmationData): Promise<void> {
    const html = this.fill(BOOKING_CONFIRMATION, {
      userName:     data.userName,
      providerName: data.providerName,
      serviceType:  data.serviceType,
      scheduledAt:  data.scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      amountInr:    `₹${data.amountInr.toLocaleString('en-IN')}`,
      bookingId:    data.bookingId,
      cancelUrl:    data.cancelUrl || `${this.appUrl}/bookings`,
      appUrl:       this.appUrl,
    });
    await this.send({
      to,
      subject: `Booking confirmed — ${data.serviceType} with ${data.providerName}`,
      html,
      tags: [{ name: 'category', value: 'booking' }],
    });
  }

  async sendBookingCancellation(to: string, data: {
    userName: string; providerName: string; serviceType: string;
    scheduledAt: Date; refundInr: number; bookingId: string;
  }): Promise<void> {
    const html = this.fill(BOOKING_CANCELLATION, {
      userName:     data.userName,
      providerName: data.providerName,
      serviceType:  data.serviceType,
      scheduledAt:  data.scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      refundInr:    data.refundInr > 0 ? `₹${data.refundInr.toLocaleString('en-IN')} will be refunded to your wallet within 24 hours.` : 'No refund applies per our cancellation policy.',
      bookingId:    data.bookingId,
      appUrl:       this.appUrl,
    });
    await this.send({
      to,
      subject: `Booking cancelled — ${data.bookingId}`,
      html,
      tags: [{ name: 'category', value: 'booking' }],
    });
  }

  async sendPayoutNotification(to: string, data: PayoutNotificationData): Promise<void> {
    const html = this.fill(PAYOUT_NOTIFICATION, {
      providerName: data.providerName,
      amountInr:    `₹${data.amountInr.toLocaleString('en-IN')}`,
      utrNumber:    data.utrNumber,
      bankLast4:    data.bankLast4,
      payoutDate:   data.payoutDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      appUrl:       this.appUrl,
    });
    await this.send({
      to,
      subject: `Payout of ₹${data.amountInr.toLocaleString('en-IN')} sent to your bank`,
      html,
      tags: [{ name: 'category', value: 'payout' }],
    });
  }

  async sendKycStatus(to: string, data: KycStatusData): Promise<void> {
    const html = this.fill(KYC_STATUS, {
      userName:         data.userName,
      status:           data.status === 'approved' ? 'Approved ✓' : 'Rejected',
      statusColor:      data.status === 'approved' ? '#16a34a' : '#dc2626',
      rejectionReason:  data.rejectionReason
        ? `<p style="color:#dc2626;margin:8px 0"><strong>Reason:</strong> ${data.rejectionReason}</p>`
        : '',
      actionText:       data.status === 'approved'
        ? 'You can now accept bookings. <a href="{{appUrl}}/provider-dashboard">Go to dashboard →</a>'
        : 'Please re-upload your documents. <a href="{{appUrl}}/provider-onboarding">Update KYC →</a>',
      appUrl:           this.appUrl,
    });
    await this.send({
      to,
      subject: `KYC ${data.status === 'approved' ? 'approved' : 'needs attention'} — ReligioGram`,
      html,
      tags: [{ name: 'category', value: 'kyc' }],
    });
  }

  async sendOtpFallback(to: string, data: OtpEmailData): Promise<void> {
    const html = this.fill(OTP_EMAIL, {
      userName:       data.userName || 'there',
      otp:            data.otp,
      expiresMinutes: String(data.expiresMinutes),
      appUrl:         this.appUrl,
    });
    await this.send({
      to,
      subject: `${data.otp} is your ReligioGram OTP`,
      html,
      tags: [{ name: 'category', value: 'auth' }],
    });
  }

  async sendWelcome(to: string, data: WelcomeData): Promise<void> {
    const html = this.fill(WELCOME_EMAIL, {
      userName: data.userName,
      role:     data.role === 'provider' ? 'service provider' : 'seeker',
      ctaUrl:   data.role === 'provider' ? `${this.appUrl}/provider-onboarding` : `${this.appUrl}/home`,
      ctaText:  data.role === 'provider' ? 'Complete your profile' : 'Explore ReligioGram',
      appUrl:   this.appUrl,
    });
    await this.send({
      to,
      subject: `Welcome to ReligioGram, ${data.userName}!`,
      html,
      tags: [{ name: 'category', value: 'welcome' }],
    });
  }

  /** Generic transactional email — use only for one-off operational alerts. */
  async sendGeneric(to: string, opts: { subject: string; html: string }): Promise<void> {
    return this.send({ to, subject: opts.subject, html: opts.html });
  }
}

// ── HTML templates (inline — no filesystem read at runtime) ──────────────────

const BASE = (content: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5e6c0;font-family:'Helvetica Neue',Arial,sans-serif}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8d8a0}
  .header{background:#0a1628;padding:24px 32px;text-align:center}
  .header h1{color:#e8a020;margin:0;font-size:22px;letter-spacing:0.5px}
  .header p{color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px}
  .body{padding:28px 32px;color:#1a1a1a}
  .body p{line-height:1.6;margin:0 0 12px;font-size:15px}
  .amount{font-size:28px;font-weight:700;color:#0a1628;margin:16px 0}
  .detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0e8d0;font-size:14px}
  .detail-row:last-child{border-bottom:none}
  .detail-label{color:#888}
  .detail-value{font-weight:500;color:#1a1a1a}
  .btn{display:inline-block;background:#c8920a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:16px 0}
  .footer{background:#f8f4ea;padding:16px 32px;text-align:center;font-size:12px;color:#aaa}
  .otp-box{background:#0a1628;color:#e8a020;font-size:36px;font-weight:700;letter-spacing:8px;padding:20px;border-radius:8px;text-align:center;margin:20px 0}
</style></head><body><div class="wrap">
<div class="header"><h1>🕉 ReligioGram</h1><p>India's spiritual services platform</p></div>
<div class="body">${content}</div>
<div class="footer">© 2025 ReligioGram · <a href="{{appUrl}}/support" style="color:#c8920a">Support</a> · <a href="{{appUrl}}/unsubscribe" style="color:#c8920a">Unsubscribe</a></div>
</div></body></html>`;

const BOOKING_CONFIRMATION = BASE(`
<p>Hi {{userName}},</p>
<p>Your booking is confirmed! Here are the details:</p>
<div>
  <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">{{serviceType}}</span></div>
  <div class="detail-row"><span class="detail-label">Provider</span><span class="detail-value">{{providerName}}</span></div>
  <div class="detail-row"><span class="detail-label">Date & Time</span><span class="detail-value">{{scheduledAt}}</span></div>
  <div class="detail-row"><span class="detail-label">Amount Paid</span><span class="detail-value">{{amountInr}}</span></div>
  <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value" style="font-family:monospace;font-size:12px">{{bookingId}}</span></div>
</div>
<p style="margin-top:20px">Need to cancel? <a href="{{cancelUrl}}" style="color:#c8920a">Cancel booking</a> (free cancellation 48h before)</p>
<a href="{{appUrl}}/bookings" class="btn">View booking</a>
`);

const BOOKING_CANCELLATION = BASE(`
<p>Hi {{userName}},</p>
<p>Your booking has been cancelled.</p>
<div>
  <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">{{serviceType}}</span></div>
  <div class="detail-row"><span class="detail-label">Provider</span><span class="detail-value">{{providerName}}</span></div>
  <div class="detail-row"><span class="detail-label">Scheduled At</span><span class="detail-value">{{scheduledAt}}</span></div>
  <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value" style="font-family:monospace;font-size:12px">{{bookingId}}</span></div>
</div>
<p style="margin-top:16px">{{refundInr}}</p>
<a href="{{appUrl}}/priests" class="btn">Book again</a>
`);

const PAYOUT_NOTIFICATION = BASE(`
<p>Hi {{providerName}},</p>
<p>Your payout has been processed successfully.</p>
<div class="amount">{{amountInr}}</div>
<div>
  <div class="detail-row"><span class="detail-label">UTR Number</span><span class="detail-value" style="font-family:monospace">{{utrNumber}}</span></div>
  <div class="detail-row"><span class="detail-label">Bank Account</span><span class="detail-value">••••{{bankLast4}}</span></div>
  <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">{{payoutDate}}</span></div>
</div>
<p style="margin-top:16px;font-size:13px;color:#888">Funds typically arrive in 1–2 business days. Keep this UTR for your records.</p>
<a href="{{appUrl}}/provider-dashboard" class="btn">View earnings</a>
`);

const KYC_STATUS = BASE(`
<p>Hi {{userName}},</p>
<p>Your KYC verification status has been updated:</p>
<p style="font-size:20px;font-weight:700;color:{{statusColor}}">{{status}}</p>
{{rejectionReason}}
<p>{{actionText}}</p>
`);

const OTP_EMAIL = BASE(`
<p>Hi {{userName}},</p>
<p>Your ReligioGram one-time password is:</p>
<div class="otp-box">{{otp}}</div>
<p style="font-size:13px;color:#888">This OTP expires in {{expiresMinutes}} minutes. Never share it with anyone.</p>
<p style="font-size:12px;color:#bbb">If you didn't request this, you can safely ignore this email.</p>
`);

const WELCOME_EMAIL = BASE(`
<p>Hi {{userName}},</p>
<p>Welcome to <strong>ReligioGram</strong> — India's spiritual services platform. You've joined as a <strong>{{role}}</strong>.</p>
<p>Connect with verified pandits, maulanas, priests and astrologers across all faiths — whenever you need them.</p>
<a href="{{ctaUrl}}" class="btn">{{ctaText}}</a>
<p style="font-size:13px;color:#888;margin-top:20px">Questions? Reply to this email or visit our <a href="{{appUrl}}/support" style="color:#c8920a">support centre</a>.</p>
`);

