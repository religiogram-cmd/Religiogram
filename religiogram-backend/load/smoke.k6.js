// ──────────────────────────────────────────────────────────────────────────────
//  ReligioGram — k6 Smoke Test
//
//  Purpose : Fast pre-deploy gate run against staging.
//            Validates that all critical API paths respond correctly under
//            light load before any production deployment.
//
//  Target  : https://api-staging.religiogram.com  (override with BASE_URL env var)
//  Config  : 10 VUs × 30 s   (threshold: p95 < 500 ms, error rate < 1%)
//
//  Usage:
//    k6 run load/smoke.k6.js
//    k6 run -e BASE_URL=https://api-staging.religiogram.com load/smoke.k6.js
//    k6 run -e BASE_URL=http://localhost:3000 load/smoke.k6.js
//
//  CI gate (GitHub Actions):
//    k6 run --exit-on-running --no-color load/smoke.k6.js
// ──────────────────────────────────────────────────────────────────────────────

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────────────────────
const errorRate    = new Rate('errors');
const providerP95  = new Trend('provider_list_duration', true);
const healthP95    = new Trend('health_duration', true);
const walletP95    = new Trend('wallet_balance_duration', true);

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL     = __ENV.BASE_URL || 'https://api-staging.religiogram.com';
// A valid Bearer token for a seeded test user (set via CI secret or .env)
const TEST_TOKEN   = __ENV.TEST_TOKEN || '';
const RELIGION     = __ENV.RELIGION   || 'hindu';

// ── Scenario / thresholds ────────────────────────────────────────────────────
export const options = {
  vus:      10,
  duration: '30s',

  thresholds: {
    // Overall http error rate must stay below 1%
    'errors':                    ['rate<0.01'],
    // 95th percentile for each endpoint family
    'http_req_duration':         ['p(95)<500'],
    'provider_list_duration':    ['p(95)<600'],
    'health_duration':           ['p(95)<200'],
    'wallet_balance_duration':   ['p(95)<400'],
    // No failed checks
    'checks':                    ['rate>0.99'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (TEST_TOKEN) h['Authorization'] = `Bearer ${TEST_TOKEN}`;
  return h;
}

function ok(res, tag) {
  const passed = check(res, {
    [`${tag} status 200`]: (r) => r.status === 200,
    [`${tag} has body`]:   (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!passed);
  return passed;
}

// ── Main scenario ─────────────────────────────────────────────────────────────
export default function () {

  // 1. Health (liveness + readiness)
  group('health', () => {
    let res = http.get(`${BASE_URL}/v1/health`, { tags: { name: 'health' } });
    healthP95.add(res.timings.duration);
    ok(res, 'GET /v1/health');

    res = http.get(`${BASE_URL}/v1/health/ready`, { tags: { name: 'health-ready' } });
    ok(res, 'GET /v1/health/ready');
  });

  sleep(0.2);

  // 2. Public provider discovery
  group('provider-discovery', () => {
    const res = http.get(
      `${BASE_URL}/v1/service-providers?religion=${RELIGION}&limit=20`,
      { headers: authHeaders(), tags: { name: 'provider-list' } },
    );
    providerP95.add(res.timings.duration);
    const passed = ok(res, 'GET /v1/service-providers');
    if (passed) {
      const body = JSON.parse(res.body);
      check(body, {
        'providers has data array': (b) => Array.isArray(b.data),
        'providers returns cursor':  (b) => 'nextCursor' in b,
      });
    }
  });

  sleep(0.2);

  // 3. Holy places listing
  group('places', () => {
    const res = http.get(
      `${BASE_URL}/v1/places?religion=${RELIGION}&limit=20`,
      { headers: authHeaders(), tags: { name: 'places-list' } },
    );
    ok(res, 'GET /v1/places');
  });

  sleep(0.2);

  // 4. Wallet balance (authenticated — skipped if no token)
  if (TEST_TOKEN) {
    group('wallet', () => {
      const res = http.get(
        `${BASE_URL}/v1/wallet/balance`,
        { headers: authHeaders(), tags: { name: 'wallet-balance' } },
      );
      walletP95.add(res.timings.duration);
      const passed = ok(res, 'GET /v1/wallet/balance');
      if (passed) {
        const body = JSON.parse(res.body);
        check(body, {
          'wallet has balancePaise': (b) => typeof b.balancePaise === 'number',
        });
      }
    });
    sleep(0.2);
  }

  // 5. Bookings list (authenticated — skipped if no token)
  if (TEST_TOKEN) {
    group('bookings', () => {
      const res = http.get(
        `${BASE_URL}/v1/bookings?status=pending&limit=20`,
        { headers: authHeaders(), tags: { name: 'bookings-list' } },
      );
      ok(res, 'GET /v1/bookings');
    });
    sleep(0.2);
  }

  // 6. Verify /metrics endpoint is NOT publicly accessible
  group('metrics-not-public', () => {
    const res = http.get(`${BASE_URL}/metrics`, { tags: { name: 'metrics-auth' } });
    check(res, {
      '/metrics returns 401 or 403': (r) => r.status === 401 || r.status === 403,
    });
  });

  sleep(0.5);
}

// ── Summary handler ───────────────────────────────────────────────────────────
export function handleSummary(data) {
  const failed = data.metrics.errors && data.metrics.errors.values.rate > 0.01;
  return {
    stdout: JSON.stringify({
      smoke_passed: !failed,
      error_rate:   data.metrics.errors ? data.metrics.errors.values.rate : 0,
      p95_ms:       data.metrics.http_req_duration
                      ? data.metrics.http_req_duration.values['p(95)']
                      : null,
    }, null, 2),
  };
}
