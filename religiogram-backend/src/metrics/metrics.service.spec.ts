import * as prom from 'prom-client';

// Reset prom-client registry before each test to avoid duplicate metric errors
beforeEach(() => {
  prom.register.clear();
});

import { MetricsService } from './metrics.service';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('MetricsService', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
  });

  // ── metric existence ───────────────────────────────────────────────────────

  describe('metric registration', () => {
    it('registers httpRequestsTotal counter', () => {
      expect(svc.httpRequestsTotal).toBeDefined();
    });

    it('registers httpRequestDuration histogram', () => {
      expect(svc.httpRequestDuration).toBeDefined();
    });

    it('registers walletDebitTotal counter', () => {
      expect(svc.walletDebitTotal).toBeDefined();
    });

    it('registers walletDebitDuplicateKeys counter', () => {
      expect(svc.walletDebitDuplicateKeys).toBeDefined();
    });

    it('registers walletBalance gauge', () => {
      expect(svc.walletBalance).toBeDefined();
    });

    it('registers bookingCreatedTotal counter', () => {
      expect(svc.bookingCreatedTotal).toBeDefined();
    });

    it('registers consultationActiveSessions gauge', () => {
      expect(svc.consultationActiveSessions).toBeDefined();
    });

    it('registers fraudSignalsTotal counter', () => {
      expect(svc.fraudSignalsTotal).toBeDefined();
    });

    it('registers searchQueriesTotal counter', () => {
      expect(svc.searchQueriesTotal).toBeDefined();
    });
  });

  // ── getMetrics ─────────────────────────────────────────────────────────────

  describe('getMetrics()', () => {
    it('returns a non-empty string', async () => {
      const result = await svc.getMetrics();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('result contains registered metric names', async () => {
      const result = await svc.getMetrics();
      expect(result).toContain('rg_http_requests_total');
      expect(result).toContain('rg_wallet_debit_total');
    });
  });

  // ── getContentType ─────────────────────────────────────────────────────────

  describe('getContentType()', () => {
    it('returns a non-empty content type string', () => {
      const ct = svc.getContentType();
      expect(typeof ct).toBe('string');
      expect(ct.length).toBeGreaterThan(0);
    });

    it('content type includes text/plain', () => {
      expect(svc.getContentType()).toContain('text/plain');
    });
  });

  // ── counter / gauge / histogram operations ────────────────────────────────

  describe('metric operations', () => {
    it('can increment httpRequestsTotal', () => {
      expect(() =>
        svc.httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' }),
      ).not.toThrow();
    });

    it('can observe httpRequestDuration', () => {
      expect(() =>
        svc.httpRequestDuration.observe({ method: 'POST', route: '/api', status_code: '201' }, 42),
      ).not.toThrow();
    });

    it('can set walletBalance gauge', () => {
      expect(() => svc.walletBalance.set(1_000_000)).not.toThrow();
    });

    it('can increment consultationActiveSessions gauge', () => {
      expect(() => svc.consultationActiveSessions.inc()).not.toThrow();
    });

    it('can decrement consultationActiveSessions gauge', () => {
      expect(() => svc.consultationActiveSessions.dec()).not.toThrow();
    });

    it('can observe consultationDurationSeconds histogram', () => {
      expect(() => svc.consultationDurationSeconds.observe(300)).not.toThrow();
    });
  });
});
