import { SecurityHeadersMiddleware } from './security-headers.middleware';

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeReq(): any {
  return {};
}

function fakeRes(): any {
  return {
    setHeader:    jest.fn(),
    removeHeader: jest.fn(),
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SecurityHeadersMiddleware', () => {
  let mw:   SecurityHeadersMiddleware;
  let next: jest.Mock;

  beforeEach(() => {
    mw   = new SecurityHeadersMiddleware();
    next = jest.fn();
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  // ── next() always called ──────────────────────────────────────────────────

  it('calls next() in production', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    mw.use(fakeReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() outside production', () => {
    process.env.NODE_ENV = 'development';
    const res = fakeRes();
    mw.use(fakeReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // ── HSTS ─────────────────────────────────────────────────────────────────

  describe('Strict-Transport-Security', () => {
    it('is set in production with 2-year max-age, includeSubDomains, preload', () => {
      process.env.NODE_ENV = 'production';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload',
      );
    });

    it('is NOT set outside production', () => {
      process.env.NODE_ENV = 'development';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      const hstsCalls = res.setHeader.mock.calls.filter(
        ([h]: [string]) => h === 'Strict-Transport-Security',
      );
      expect(hstsCalls).toHaveLength(0);
    });
  });

  // ── CSP ──────────────────────────────────────────────────────────────────

  describe('Content-Security-Policy', () => {
    it('is always set', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
    });

    it('production CSP does not contain unsafe-eval', () => {
      process.env.NODE_ENV = 'production';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      const [, csp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Content-Security-Policy',
      )!;
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('production CSP contains frame-ancestors none', () => {
      process.env.NODE_ENV = 'production';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      const [, csp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Content-Security-Policy',
      )!;
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('development CSP contains unsafe-eval for HMR', () => {
      process.env.NODE_ENV = 'development';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      const [, csp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Content-Security-Policy',
      )!;
      expect(csp).toContain("'unsafe-eval'");
    });

    it('production CSP contains upgrade-insecure-requests', () => {
      process.env.NODE_ENV = 'production';
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      const [, csp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Content-Security-Policy',
      )!;
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  // ── cross-origin isolation headers ───────────────────────────────────────

  describe('cross-origin isolation', () => {
    it('sets Cross-Origin-Opener-Policy: same-origin', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Opener-Policy', 'same-origin');
    });

    it('sets Cross-Origin-Embedder-Policy: credentialless', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Embedder-Policy', 'credentialless');
    });

    it('sets Cross-Origin-Resource-Policy: same-site', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'same-site');
    });
  });

  // ── standard security headers ─────────────────────────────────────────────

  describe('standard security headers', () => {
    let res: any;

    beforeEach(() => {
      res = fakeRes();
      mw.use(fakeReq(), res, next);
    });

    it('sets X-Content-Type-Options: nosniff', () => {
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('sets X-Frame-Options: DENY', () => {
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('sets Referrer-Policy: strict-origin-when-cross-origin', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin',
      );
    });

    it('sets Permissions-Policy', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('camera=()'),
      );
    });

    it('Permissions-Policy disables microphone', () => {
      const [, pp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Permissions-Policy',
      )!;
      expect(pp).toContain('microphone=()');
    });

    it('Permissions-Policy disables interest-cohort (FLoC)', () => {
      const [, pp] = res.setHeader.mock.calls.find(
        ([h]: [string]) => h === 'Permissions-Policy',
      )!;
      expect(pp).toContain('interest-cohort=()');
    });
  });

  // ── fingerprinting header removal ─────────────────────────────────────────

  describe('fingerprinting header removal', () => {
    it('removes X-Powered-By', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    it('removes Server', () => {
      const res = fakeRes();
      mw.use(fakeReq(), res, next);
      expect(res.removeHeader).toHaveBeenCalledWith('Server');
    });
  });
});
