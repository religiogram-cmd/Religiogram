/**
 * v10 regression suite — pins the v9.1 re-audit findings.
 *
 * These tests would have caught:
 *   - P0-A: emailLogin / emailRegister missing setRefreshCookie in cookie mode
 *           (latent from v5 through v9.1)
 *   - P1-A: reconcileStuckRefunds not finalising payment + booking
 *   - P1-B: CSRF bypass when bearer-without-cookie
 *   - P1-C: ADVISORY_LOCK_KEYS dynamic import inside transaction (perf)
 *   - P1-D: ORDER BY created_at without tiebreaker
 *
 * The first two tests are CONTRACT tests — they read the source code and
 * assert the relationship is present. This is cheaper than booting Postgres
 * and catches the exact regression that bit us in v5/v8/v9.1: a regex-based
 * patcher silently failing to match a handler signature.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', 'src');

describe('v10 regression suite — contract tests', () => {
  // ─── P0-A: cookie wiring on email auth ───────────────────────────────
  describe('P0-A: every cookie-eligible auth handler calls setRefreshCookie', () => {
    const ctrl = fs.readFileSync(
      path.join(ROOT, 'auth', 'controllers', 'auth.controller.ts'),
      'utf8',
    );

    it('verifyOtp handler invokes setRefreshCookie', () => {
      const body = sliceHandler(ctrl, 'verifyOtp');
      expect(body).toContain('this.setRefreshCookie(res');
    });

    it('emailLogin handler invokes setRefreshCookie (was missing in v5-v9.1)', () => {
      const body = sliceHandler(ctrl, 'emailLogin');
      expect(body).toContain('@Res({ passthrough: true }) res: Response');
      expect(body).toContain('this.setRefreshCookie(res');
    });

    it('emailRegister handler invokes setRefreshCookie (was missing in v5-v9.1)', () => {
      const body = sliceHandler(ctrl, 'emailRegister');
      expect(body).toContain('@Res({ passthrough: true }) res: Response');
      expect(body).toContain('this.setRefreshCookie(res');
    });

    it('refresh handler invokes setRefreshCookie', () => {
      const body = sliceHandler(ctrl, 'refresh');
      expect(body).toContain('this.setRefreshCookie(res');
    });
  });

  // ─── P1-A: reconciler calls the shared finaliser ────────────────────
  describe('P1-A: reconcileStuckRefunds uses the same finaliser as Phase 3', () => {
    const svc = fs.readFileSync(
      path.join(ROOT, 'payments', 'payments.service.ts'),
      'utf8',
    );

    it('exposes a private finalizeRefundLocally method', () => {
      expect(svc).toMatch(/private async finalizeRefundLocally\(/);
    });

    it('refundPayment Phase 3 calls finalizeRefundLocally', () => {
      const body = sliceMethod(svc, 'refundPayment');
      expect(body).toContain('this.finalizeRefundLocally(');
    });

    it('reconcileStuckRefunds calls finalizeRefundLocally', () => {
      const body = sliceMethod(svc, 'reconcileStuckRefunds');
      expect(body).toContain('this.finalizeRefundLocally(');
    });
  });

  // ─── P1-B: CSRF rejects bearer-without-cookie ────────────────────────
  describe('P1-B: CSRF middleware rejects browser sessions missing rg_csrf', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'common', 'middleware', 'csrf.middleware.ts'),
      'utf8',
    );
    it('rejects Bearer + cookies-but-no-rg_csrf', () => {
      expect(src).toContain('CSRF_COOKIE_MISSING');
      expect(src).toMatch(/hasBearer && !cookieToken/);
    });
  });

  // ─── P1-C: ADVISORY_LOCK_KEYS is statically imported ───────────────
  describe('P1-C: AdminAuditService uses a static import for ADVISORY_LOCK_KEYS', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'admin', 'admin-audit.service.ts'),
      'utf8',
    );
    it('imports ADVISORY_LOCK_KEYS at top-of-file', () => {
      // Top half of the file (above the first method) should have the import.
      const top = src.split('async log')[0];
      expect(top).toContain("import { ADVISORY_LOCK_KEYS } from '../common/db/advisory-locks'");
    });
    it('does NOT use dynamic import inside log()', () => {
      const body = sliceMethod(src, 'log');
      expect(body).not.toContain("await import('../common/db/advisory-locks')");
    });
  });

  // ─── P1-D: chain-head SELECT uses a unique tiebreaker ──────────────
  describe('P1-D: ORDER BY in admin-audit.service.ts has a tiebreaker', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'admin', 'admin-audit.service.ts'),
      'utf8',
    );
    it('every ORDER BY created_at DESC LIMIT 1 has `, id DESC`', () => {
      // No unconditional `ORDER BY created_at DESC LIMIT 1` allowed.
      expect(src).not.toMatch(/ORDER BY created_at DESC LIMIT 1[^,]/);
      expect(src).toMatch(/ORDER BY created_at DESC, id DESC LIMIT 1/);
    });
  });
});

// ─── helpers ───────────────────────────────────────────────────────────
function sliceHandler(src: string, name: string): string {
  const re = new RegExp(`async\\s+${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`Could not locate handler ${name} in source`);
  return m[0];
}
function sliceMethod(src: string, name: string): string {
  // Same as sliceHandler but allows private/protected modifiers.
  const re = new RegExp(`(?:private|public|protected)?\\s*async\\s+${name}\\s*\\([\\s\\S]*?\\n  \\}`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`Could not locate method ${name} in source`);
  return m[0];
}
