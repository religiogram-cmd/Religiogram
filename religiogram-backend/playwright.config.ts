import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright browser-automation E2E smoke tests.
 * These tests run against a live staging/local URL and exercise
 * critical user flows in a real browser.
 *
 * Run locally:
 *   BASE_URL=http://localhost:3000 npx playwright test
 * Run against staging:
 *   BASE_URL=https://api-staging.religiogram.com npx playwright test
 *
 * CI: see .github/workflows/deploy.yml (runs after smoke gate, before production)
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.spec.ts',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['line'],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    // All requests go through the API — no browser UI; use APIRequestContext
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    // Trace on retry for debugging
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'api-smoke',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
