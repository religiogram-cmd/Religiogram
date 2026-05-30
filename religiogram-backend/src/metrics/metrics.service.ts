import { Injectable, OnModuleInit } from '@nestjs/common';
import * as prom from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  // HTTP metrics
  readonly httpRequestsTotal: prom.Counter<string>;
  readonly httpRequestDuration: prom.Histogram<string>;

  // Wallet metrics
  readonly walletDebitTotal: prom.Counter<string>;
  readonly walletDebitDuration: prom.Histogram<string>;
  readonly walletDebitDuplicateKeys: prom.Counter<string>;
  readonly walletBalance: prom.Gauge<string>;

  // Booking metrics
  readonly bookingCreatedTotal: prom.Counter<string>;
  readonly bookingCompletedTotal: prom.Counter<string>;
  readonly bookingCancelledTotal: prom.Counter<string>;
  readonly bookingPaymentFailedTotal: prom.Counter<string>;

  // Consultation metrics
  readonly consultationActiveSessions: prom.Gauge<string>;
  readonly consultationTicksTotal: prom.Counter<string>;
  readonly consultationDropRate: prom.Counter<string>;
  readonly consultationDurationSeconds: prom.Histogram<string>;

  // Payment metrics
  readonly paymentCapturedTotal: prom.Counter<string>;
  readonly paymentFailedTotal: prom.Counter<string>;
  readonly paymentAmountPaise: prom.Histogram<string>;

  // Notification metrics
  readonly notificationDispatchTotal: prom.Counter<string>;
  readonly notificationFailureTotal: prom.Counter<string>;

  // Fraud metrics
  readonly fraudSignalsTotal: prom.Counter<string>;
  readonly fraudSuspensionsTotal: prom.Counter<string>;

  // Search metrics
  readonly searchQueriesTotal: prom.Counter<string>;
  readonly searchLatency: prom.Histogram<string>;

  constructor() {
    prom.collectDefaultMetrics({ prefix: 'rg_node_' });

    this.httpRequestsTotal = new prom.Counter({
      name: 'rg_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpRequestDuration = new prom.Histogram({
      name: 'rg_http_request_duration_ms',
      help: 'HTTP request duration in milliseconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
    });

    this.walletDebitTotal = new prom.Counter({
      name: 'rg_wallet_debit_total',
      help: 'Total wallet debit operations',
      labelNames: ['entry_type', 'result'],
    });

    this.walletDebitDuration = new prom.Histogram({
      name: 'rg_wallet_debit_duration_ms',
      help: 'Wallet debit transaction duration in milliseconds',
      buckets: [5, 10, 25, 50, 100, 250, 500],
    });

    this.walletDebitDuplicateKeys = new prom.Counter({
      name: 'rg_wallet_debit_duplicate_key_violations_total',
      help: 'CRITICAL: duplicate idempotency key violations on wallet debit — must always be 0',
    });

    this.walletBalance = new prom.Gauge({
      name: 'rg_wallet_total_available_paise',
      help: 'Approximate total available balance across all wallets (sampled)',
    });

    this.bookingCreatedTotal = new prom.Counter({
      name: 'rg_booking_created_total',
      help: 'Total bookings created',
      labelNames: ['service_type', 'religion'],
    });

    this.bookingCompletedTotal = new prom.Counter({
      name: 'rg_booking_completed_total',
      help: 'Total bookings completed',
    });

    this.bookingCancelledTotal = new prom.Counter({
      name: 'rg_booking_cancelled_total',
      help: 'Total bookings cancelled',
      labelNames: ['cancelled_by'],
    });

    this.bookingPaymentFailedTotal = new prom.Counter({
      name: 'rg_booking_payment_failed_total',
      help: 'Booking payment failures',
      labelNames: ['reason'],
    });

    this.consultationActiveSessions = new prom.Gauge({
      name: 'rg_consultation_active_sessions',
      help: 'Currently active consultation sessions',
    });

    this.consultationTicksTotal = new prom.Counter({
      name: 'rg_consultation_ticks_total',
      help: 'Total billing ticks processed',
    });

    this.consultationDropRate = new prom.Counter({
      name: 'rg_consultation_drops_total',
      help: 'Sessions dropped due to disconnect or low balance',
      labelNames: ['reason'],
    });

    this.consultationDurationSeconds = new prom.Histogram({
      name: 'rg_consultation_duration_seconds',
      help: 'Consultation session duration in seconds',
      buckets: [60, 180, 300, 600, 900, 1800, 3600],
    });

    this.paymentCapturedTotal = new prom.Counter({
      name: 'rg_payment_captured_total',
      help: 'Total payments captured',
      labelNames: ['method'],
    });

    this.paymentFailedTotal = new prom.Counter({
      name: 'rg_payment_failed_total',
      help: 'Total payment failures',
      labelNames: ['reason'],
    });

    this.paymentAmountPaise = new prom.Histogram({
      name: 'rg_payment_amount_paise',
      help: 'Payment amounts in paise',
      buckets: [10000, 50000, 100000, 500000, 1000000, 5000000],
    });

    this.notificationDispatchTotal = new prom.Counter({
      name: 'rg_notification_dispatch_total',
      help: 'Notifications dispatched',
      labelNames: ['channel', 'template'],
    });

    this.notificationFailureTotal = new prom.Counter({
      name: 'rg_notification_failure_total',
      help: 'Notification delivery failures',
      labelNames: ['channel', 'reason'],
    });

    this.fraudSignalsTotal = new prom.Counter({
      name: 'rg_fraud_signals_total',
      help: 'Fraud signals created',
      labelNames: ['signal_type'],
    });

    this.fraudSuspensionsTotal = new prom.Counter({
      name: 'rg_fraud_suspensions_total',
      help: 'Accounts auto-suspended due to fraud signals',
    });

    this.searchQueriesTotal = new prom.Counter({
      name: 'rg_search_queries_total',
      help: 'Search queries executed',
      labelNames: ['type'],
    });

    this.searchLatency = new prom.Histogram({
      name: 'rg_search_latency_ms',
      help: 'Search query latency',
      labelNames: ['type'],
      buckets: [10, 25, 50, 100, 200, 500, 1000],
    });
  }

  onModuleInit() {
    // Nothing to initialize — prom.collectDefaultMetrics already called in constructor
  }

  async getMetrics(): Promise<string> {
    return prom.register.metrics();
  }

  getContentType(): string {
    return prom.register.contentType;
  }
}
