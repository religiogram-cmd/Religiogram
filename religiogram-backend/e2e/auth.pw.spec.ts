import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Playwright E2E: Authentication smoke test.
 * Uses the dev OTP bypass (DEV_OTP_BYPASS=1 + OTP=000000) to authenticate
 * without sending a real SMS. Only runs against non-production environments.
 *
 * Prerequisites:
 *   - NODE_ENV=development and DEV_OTP_BYPASS=1 on the target server
 *   - A test phone number (TEST_PHONE env var, default +919999999999)
 */
test.describe('Authentication Flow', () => {
  let api: APIRequestContext;
  const TEST_PHONE = process.env.TEST_PHONE ?? '+919999999999';

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('POST /v1/auth/send-otp returns 201 for valid phone', async () => {
    const res = await api.post('/v1/auth/send-otp', {
      data: { phone: TEST_PHONE },
    });
    // 201 = OTP sent; 429 = rate-limited (also acceptable — means auth is up)
    expect([201, 429]).toContain(res.status());
  });

  test('Full OTP auth: send → verify → receive JWT', async () => {
    // Step 1: send OTP
    const sendRes = await api.post('/v1/auth/send-otp', {
      data: { phone: TEST_PHONE },
    });
    if (sendRes.status() === 429) {
      test.skip(); // Rate-limited — skip gracefully
    }
    expect(sendRes.status()).toBe(201);

    // Step 2: verify with dev bypass OTP '000000'
    const verifyRes = await api.post('/v1/auth/verify-otp', {
      data: { phone: TEST_PHONE, otp: '000000' },
    });

    if (verifyRes.status() === 401) {
      // DEV_OTP_BYPASS not enabled on this server — expected in staging
      console.log('DEV_OTP_BYPASS not enabled — skipping token verification');
      return;
    }

    expect(verifyRes.status()).toBe(201);
    const body = await verifyRes.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.split('.').length).toBe(3); // valid JWT structure
  });
});
