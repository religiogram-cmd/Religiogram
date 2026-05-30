import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Playwright E2E: Provider discovery smoke test.
 * Verifies the discovery endpoint returns correctly shaped data
 * and that booking creation requires authentication.
 */
test.describe('Provider Discovery', () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('GET /v1/priests returns paginated list with cursor', async () => {
    const res = await api.get('/v1/priests?limit=5');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('nextCursor');
    expect(body).toHaveProperty('hasMore');
  });

  test('GET /v1/priests cursor pagination is stable', async () => {
    const page1 = await api.get('/v1/priests?limit=2');
    expect(page1.status()).toBe(200);
    const body1 = await page1.json();

    if (!body1.hasMore || !body1.nextCursor) return; // not enough data to page

    const page2 = await api.get(`/v1/priests?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`);
    expect(page2.status()).toBe(200);
    const body2 = await page2.json();

    // Page 2 should not overlap with page 1
    const ids1 = body1.data.map((p: { id: string }) => p.id);
    const ids2 = body2.data.map((p: { id: string }) => p.id);
    const overlap = ids1.filter((id: string) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  test('POST /v1/bookings requires authentication (401)', async () => {
    const res = await api.post('/v1/bookings', {
      data: {
        providerId: '00000000-0000-0000-0000-000000000000',
        serviceId: '00000000-0000-0000-0000-000000000000',
        slotStart: new Date().toISOString(),
        slotEnd: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /v1/wallet/topup requires authentication (401)', async () => {
    const res = await api.post('/v1/wallet/topup', {
      data: { amountPaise: 10000 },
    });
    expect([401, 403]).toContain(res.status());
  });
});
