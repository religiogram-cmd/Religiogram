/**
 * Jest configuration — P2-5 coverage gate.
 *
 * Thresholds:
 *   - Global: 60 % lines/statements/branches/functions
 *   - Money path (payments, wallet, bookings): 80 %
 *
 * Run with coverage:  npm test -- --coverage
 * CI gate step uses:  npm run test:cov
 *
 * The money-path override ensures the most financially-sensitive code
 * stays well-tested even as the global threshold is intentionally
 * relaxed for early-stage rapid iteration.
 */
'use strict';

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // Exclude generated / infra files — not meaningful to test
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/migrations/**',
    '!**/*.entity.ts',
    '!**/*.dto.ts',
    '!**/*.interface.ts',
    '!**/*.types.ts',
    '!**/*.constants.ts',
    '!**/index.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThreshold: {
    // ── Global minimum ────────────────────────────────────────
    global: {
      lines: 60,
      statements: 60,
      branches: 55,
      functions: 60,
    },
    // ── Money-path modules: stricter threshold ─────────────────
    // Each glob resolves relative to rootDir (src/)
    './payments/**/*.ts': {
      lines: 80,
      statements: 80,
      branches: 75,
      functions: 80,
    },
    './wallet/**/*.ts': {
      lines: 80,
      statements: 80,
      branches: 75,
      functions: 80,
    },
    './bookings/**/*.ts': {
      lines: 80,
      statements: 80,
      branches: 75,
      functions: 80,
    },
  },
};
