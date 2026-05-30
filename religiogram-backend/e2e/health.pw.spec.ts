import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Playwright E2E: Health & Readiness smoke test.
 * Verifies the API is up, DB is reachable, and all dependency queues are healthy.
 */
test.describe('Health Endpoints', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('GET /v1/health returns 200 with status ok', async () => {
    const res = await api.get('/v1/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });

  test('GET /v1/health/ready returns 200 with all checks passing', async () => {
    const res = await api.get('/v1/health/ready');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    // Verify DB check present
    expect(body.info).toHaveProperty('database');
    expect(body.info.database.status).toBe('up');
    // Verify Redis check present
    expect(body.info).toHaveProperty('redis');
    expect(body.info.redis.status).toBe('up');
  });

  test('GET /v1/metrics requires auth (403 without bearer)', async () => {
    const res = await api.get('/metrics');
    expect([401, 403]).toContain(res.status());
  });
});
