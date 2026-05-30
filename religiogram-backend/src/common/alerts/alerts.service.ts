import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Alert channels. Narrow set so dashboards can group by channel.
 */
export type AlertChannel =
  | 'otp_failure'
  | 'otp_quota_exceeded'
  | 'payment_failure'
  | 'webhook_failure'
  | 'chat_disconnect'
  | 'chat_storm'
  | 'db_pool_pressure'
  | 'feature_flag_read_error'
  | 'memory_pressure'
  | 'wallet_reconciliation'
  | 'refund_failures'
  | 'fraud_critical'
  | 'audit_tamper_detection'
  | 'session_billing'
  | 'dlq_job_failed'
  | 'generic';

export type AlertSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface AlertPayload {
  channel: AlertChannel;
  severity: AlertSeverity;
  message: string;
  /** Structured context — never include PII or raw OTPs. */
  context?: Record<string, unknown>;
  /** Correlation ID: request id / job id / user id (hashed). */
  correlationId?: string;
  /** Error instance, if this is tied to a caught exception. */
  error?: Error;
}

/**
 * Centralised alert hook.
 *
 * Behaviour:
 *   - Always emits a structured JSON log line (single line, no linebreaks)
 *     so CloudWatch Logs Insights / Datadog Log Management can filter
 *     on `channel` and `severity`.
 *   - If SENTRY_DSN is set, forwards error/critical to Sentry.
 *     (Import lazily — avoids pulling @sentry/node into services that
 *      don't need it.)
 *   - If SLACK_ALERT_WEBHOOK_URL is set, posts critical alerts to Slack.
 *   - Never throws — alerting failures must not break the caller.
 *
 * Why this shape: a single fire() call at every failure site means we
 * can add PagerDuty / Opsgenie later by editing one file.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly slackWebhook?: string;
  private readonly sentryDsn?: string;
  private readonly env: string;
  private readonly podId: string;
  private sentryInitialized = false;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.slackWebhook = this.config.get<string>('alerts.slackWebhookUrl');
    this.sentryDsn = this.config.get<string>('alerts.sentryDsn');
    this.env = this.config.get<string>('app.env', 'development');
    this.podId = process.env.POD_ID ?? process.env.HOSTNAME ?? 'local';

    if (this.sentryDsn) {
      void this.initSentry().catch((e) =>
        this.logger.warn(`Sentry init failed: ${(e as Error).message}`),
      );
    }
  }

  private async initSentry(): Promise<void> {
    try {
      // @ts-ignore — @sentry/node is an optional peer dep
      const Sentry = await import('@sentry/node');
      Sentry.init({
        dsn: this.sentryDsn,
        environment: this.env,
        tracesSampleRate: 0.01,
        beforeSend(event: any) {
          const stripped = JSON.stringify(event).replace(
            /(\b\d{6}\b|\b\+?91\d{10}\b)/g,
            '[redacted]',
          );
          return JSON.parse(stripped);
        },
      });
      this.sentryInitialized = true;
    } catch {
      this.sentryInitialized = false;
    }
  }

  /**
   * Fire an alert. Never throws.
   */
  async fire(payload: AlertPayload): Promise<void> {
    const { channel, severity, message, context, correlationId, error } =
      payload;

    const entry = {
      ts: new Date().toISOString(),
      level: severity,
      type: 'alert',
      channel,
      env: this.env,
      pod: this.podId,
      correlationId,
      message,
      context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 10).join('\n'),
          }
        : undefined,
    };

    const line = JSON.stringify(entry);
    if (severity === 'critical' || severity === 'error') {
      this.logger.error(line);
    } else if (severity === 'warn') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }

    // Sentry
    if (
      this.sentryInitialized &&
      (severity === 'error' || severity === 'critical')
    ) {
      try {
        // @ts-ignore — @sentry/node is an optional peer dep
        const Sentry = await import('@sentry/node');
        Sentry.withScope((scope: any) => {
          scope.setTag('channel', channel);
          scope.setLevel(severity === 'critical' ? 'fatal' : 'error');
          if (correlationId) scope.setTag('correlationId', correlationId);
          if (context) scope.setContext('alert', context);
          if (error) {
            Sentry.captureException(error);
          } else {
            Sentry.captureMessage(message);
          }
        });
      } catch {
        /* swallow */
      }
    }

    // Slack (critical only)
    if (this.slackWebhook && severity === 'critical') {
      try {
        await firstValueFrom(
          this.http.post(this.slackWebhook, {
            text: `:rotating_light: *${channel}* (${this.env}/${this.podId})\n${message}`,
            attachments: [
              {
                color: 'danger',
                fields: Object.entries(context ?? {})
                  .slice(0, 10)
                  .map(([k, v]) => ({
                    title: k,
                    value: String(v).slice(0, 200),
                    short: true,
                  })),
              },
            ],
          }),
        );
      } catch {
        /* swallow — Slack outage must not break the caller */
      }
    }
  }
}
