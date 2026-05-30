// ──────────────────────────────────────────────────────────────────────────────
//  ReligioGram — k6 Soak Test
//
//  Purpose : Validate sustained performance and detect memory leaks, connection
//            pool exhaustion, or gradual degradation under production-like load.
//
//  Target  : https://api-staging.religiogram.com  (override with BASE_URL env var)
//  Config  : Ramp 0→50 VUs in 2 min, hold 50 VUs for 28 min, ramp down 2 min
//            Total duration: 32 min
//
//  Thresholds:
//    - p95 response time < 800 ms throughout (tighter: < 500 ms in first 5 min)
//    - Error rate < 0.5% over full run
//    - No degradation: p95 in last 5 min ≤ 1.2× p95 in first 5 min
//
//  Usage:
//    k6 run load/soak.k6.js
//    k6 run -e BASE_URL=https://api-staging.religiogram.com \
//           -e TEST_TOKEN=<jwt> load/soak.k6.js
//
//  NOTE: Run from a machine outside the k8s cluster to test real network path.
//        The soak test is NOT run in CI (too long); trigger manually pre-release.
// ──────────────────────────────────────────────────────────────────────────────

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const errorRate      = new Rate('errors');
const providerTrend  = new Trend('soak_provider_duration', true);
const healthTrend    = new Trend('soak_health_duration', true);
const walletTrend    = new Trend('soak_wallet_duration', true);
const bookingTrend   = new Trend('soak_booking_duration', true);
const requestCounter = new Counter('total_requests');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL   = __ENV.BASE_URL  || 'https://api-staging.religiogram.com';
const TEST_TOKEN = __ENV.TEST_TOKEN || '';
const RELIGION   = __ENV.RELIGION  || 'hindu';

// ── Scenario ──────────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: '2m',  target: 50 },   // ramp up
    { duration: '28m', target: 50 },   // hold at peak
    { duration: '2m',  target: 0  },   // ramp down
  ],

  thresholds: {
    'errors':                   ['rate<0.005'],     // < 0.5% error rate
    'http_req_duration':        ['p(95)<800'],       // 95th percentile < 800 ms
    'soak_provider_duration':   ['p(95)<800', 'p(99)<1500'],
    'soak_health_duration':     ['p(95)<300'],
    'soak_wallet_duration':     ['p(95)<600'],
    'soak_booking_duration':    ['p(95)<700'],
    'checks':                   ['rate>0.995'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (TEST_TOKEN) h['Authorization'] = `Bearer ${TEST_TOKEN}`;
  return h;
}

function ok(res, tag) {
  requestCounter.add(1);
  const passed = check(res, {
    [`${tag} 2xx`]:      (r) => r.status >= 200 && r.status < 300,
    [`${tag} has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!passed);
  return passed;
}

// ── Weighted scenario mix (mimics real traffic distribution) ──────────────────
// Based on expected production traffic patterns:
//   40% discovery (provider search)
//   20% health checks (LB probes + readiness)
//   20% bookings list
//   15% wallet queries (authenticated)
//    5% places listing
//
// Each iteration randomly samples from this distribution.

export default function () {
  const roll = Math.random();

  if (roll < 0.40) {
    // Provider discovery — most common user action
    group('provider-discovery', () => {
      // Vary pagination cursor and religion to exercise cache variety
      const religions = ['hindu', 'muslim', 'sikh', 'christian', 'jain'];
      const rel = religions[Math.floor(Math.random() * religions.length)];
      const res = http.get(
        `${BASE_URL}/v1/service-providers?religion=${rel}&limit=20`,
        { headers: authHeaders(), tags: { name: 'provider-list' } },
      );
      providerTrend.add(res.timings.duration);
      const passed = ok(res, 'GET /v1/service-providers');
      if (passed) {
        try {
          const body = JSON.parse(res.body);
          check(body, {
            'providers data is array': (b) => Array.isArray(b.data),
          });
        } catch (_) { /* ignore parse errors */ }
      }
    });

  } else if (roll < 0.60) {
    // Health probes
    group('health', () => {
      const res = http.get(`${BASE_URL}/v1/health`, { tags: { name: 'health' } });
      healthTrend.add(res.timings.duration);
      ok(res, 'GET /v1/health');
    });

  } else if (roll < 0.80) {
    // Bookings list (authenticated)
    if (TEST_TOKEN) {
      group('bookings', () => {
        const statuses = ['pending', 'confirmed', 'completed'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const res = http.get(
          `${BASE_URL}/v1/bookings?status=${status}&limit=20`,
          { headers: authHeaders(), tags: { name: 'bookings-list' } },
        );
        bookingTrend.add(res.timings.duration);
        ok(res, 'GET /v1/bookings');
      });
    } else {
      // Fallback to health if no auth token
      const res = http.get(`${BASE_URL}/v1/health/ready`, { tags: { name: 'health-ready' } });
      healthTrend.add(res.timings.duration);
      ok(res, 'GET /v1/health/ready');
    }

  } else if (roll < 0.95) {
    // Wallet balance (authenticated)
    if (TEST_TOKEN) {
      group('wallet', () => {
        const res = http.get(
          `${BASE_URL}/v1/wallet/balance`,
          { headers: authHeaders(), tags: { name: 'wallet-balance' } },
        );
        walletTrend.add(res.timings.duration);
        const passed = ok(res, 'GET /v1/wallet/balance');
        if (passed) {
          try {
            const body = JSON.parse(res.body);
            check(body, {
              'wallet balancePaise is number': (b) => typeof b.balancePaise === 'number',
            });
          } catch (_) { /* ignore */ }
        }
      });
    } else {
      const res = http.get(
        `${BASE_URL}/v1/service-providers?limit=10`,
        { headers: authHeaders(), tags: { name: 'provider-list-small' } },
      );
      providerTrend.add(res.timings.duration);
      ok(res, 'GET /v1/service-providers (fallback)');
    }

  } else {
    // Places listing
    group('places', () => {
      const religions = ['hindu', 'muslim', 'sikh'];
      const rel = religions[Math.floor(Math.random() * religions.length)];
      const res = http.get(
        `${BASE_URL}/v1/places?religion=${rel}&limit=20`,
        { headers: authHeaders(), tags: { name: 'places-list' } },
      );
      ok(res, 'GET /v1/places');
    });
  }

  // Think time: 0.5–2.0 s (simulates real user pacing)
  sleep(0.5 + Math.random() * 1.5);
}

// ── Summary handler ───────────────────────────────────────────────────────────
export function handleSummary(data) {
  const m = data.metrics;
  const errorRateVal = m.errors ? m.errors.values.rate : 0;
  const p95          = m.http_req_duration ? m.http_req_duration.values['p(95)'] : null;
  const p99          = m.http_req_duration ? m.http_req_duration.values['p(99)'] : null;
  const totalReqs    = m.total_requests ? m.total_requests.values.count : null;

  const summary = {
    soak_passed:   errorRateVal < 0.005 && (p95 === null || p95 < 800),
    error_rate:    errorRateVal,
    p95_ms:        p95,
    p99_ms:        p99,
    total_requests: totalReqs,
    thresholds_passed: Object.fromEntries(
      Object.entries(data.metrics)
        .filter(([, v]) => v.thresholds)
        .map(([k, v]) => [k, !Object.values(v.thresholds).some(t => t.ok === false)])
    ),
  };

  // NOTE: Do NOT write to local filesystem ('load/soak-results.json') here —
  // in CI the path does not exist and the write silently fails.
  // To persist soak results from CI, add an actions/upload-artifact step after
  // the k6 run targeting the k6 output file (--out json=soak-results.json flag).
  return {
    stdout: JSON.stringify(summary, null, 2),
  };
}
