import { LoadSheddingMiddleware } from './load-shedding.middleware';
import { ServiceUnavailableException } from '@nestjs/common';

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeReq(path: string): any {
  return { path };
}

function fakeRes(): any {
  return { setHeader: jest.fn() };
}

/**
 * Force the middleware to use a pre-set CPU value without triggering os.cpus().
 * We set lastSample to Date.now() so refreshCpu() returns early,
 * and directly assign cpuUsage.
 */
function setCpu(mw: LoadSheddingMiddleware, pct: number): void {
  (mw as any).cpuUsage  = pct;
  (mw as any).lastSample = Date.now();
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('LoadSheddingMiddleware', () => {
  let mw: LoadSheddingMiddleware;
  let next: jest.Mock;

  beforeEach(() => {
    mw   = new LoadSheddingMiddleware();
    next = jest.fn();
  });

  // ── protected paths always pass ───────────────────────────────────────────

  describe('protected paths', () => {
    const protectedPaths = [
      '/v1/auth/login',
      '/v1/wallet/balance',
      '/v1/bookings/123',
      '/v1/payments/webhook',
      '/health',
      '/metrics',
    ];

    for (const path of protectedPaths) {
      it(`passes ${path} even at 99% CPU`, () => {
        setCpu(mw, 99);
        expect(() => mw.use(fakeReq(path), fakeRes(), next)).not.toThrow();
        expect(next).toHaveBeenCalledTimes(1);
      });
    }
  });

  // ── normal load (< 80%) — all paths pass ─────────────────────────────────

  describe('when CPU < 80%', () => {
    it('passes /v1/analytics', () => {
      setCpu(mw, 50);
      expect(() => mw.use(fakeReq('/v1/analytics/events'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('passes /v1/social', () => {
      setCpu(mw, 70);
      expect(() => mw.use(fakeReq('/v1/social/feed'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('passes /v1/places', () => {
      setCpu(mw, 79);
      expect(() => mw.use(fakeReq('/v1/places/search'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  // ── 80–89%: NON_CRITICAL_80 shed ─────────────────────────────────────────

  describe('when 80 ≤ CPU < 90', () => {
    it('sheds /v1/analytics with ServiceUnavailableException', () => {
      setCpu(mw, 85);
      expect(() => mw.use(fakeReq('/v1/analytics/events'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sets Retry-After: 15 for /v1/analytics', () => {
      setCpu(mw, 85);
      const res = fakeRes();
      try { mw.use(fakeReq('/v1/analytics/events'), res, next); } catch {}
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '15');
    });

    it('sheds /v1/search with ServiceUnavailableException', () => {
      setCpu(mw, 80);
      expect(() => mw.use(fakeReq('/v1/search/providers'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sets Retry-After: 15 for /v1/search', () => {
      setCpu(mw, 82);
      const res = fakeRes();
      try { mw.use(fakeReq('/v1/search'), res, next); } catch {}
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '15');
    });

    it('still passes /v1/social at 85% CPU', () => {
      setCpu(mw, 85);
      expect(() => mw.use(fakeReq('/v1/social/feed'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('still passes /v1/places at 85% CPU', () => {
      setCpu(mw, 85);
      expect(() => mw.use(fakeReq('/v1/places/123'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  // ── 90–94%: NON_CRITICAL_80 + NON_CRITICAL_90 shed ───────────────────────

  describe('when 90 ≤ CPU < 95', () => {
    it('sheds /v1/notifications', () => {
      setCpu(mw, 92);
      expect(() => mw.use(fakeReq('/v1/notifications'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sets Retry-After: 30 for /v1/notifications', () => {
      setCpu(mw, 92);
      const res = fakeRes();
      try { mw.use(fakeReq('/v1/notifications'), res, next); } catch {}
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    });

    it('sheds /v1/social', () => {
      setCpu(mw, 90);
      expect(() => mw.use(fakeReq('/v1/social/feed'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sets Retry-After: 30 for /v1/social', () => {
      setCpu(mw, 93);
      const res = fakeRes();
      try { mw.use(fakeReq('/v1/social/feed'), res, next); } catch {}
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    });

    it('sheds /v1/places', () => {
      setCpu(mw, 91);
      expect(() => mw.use(fakeReq('/v1/places/events'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sheds /v1/analytics (also under NON_CRITICAL_80 threshold)', () => {
      setCpu(mw, 90);
      expect(() => mw.use(fakeReq('/v1/analytics/track'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });
  });

  // ── ≥ 95%: everything non-protected shed ─────────────────────────────────

  describe('when CPU ≥ 95%', () => {
    it('sheds /v1/priests (unrelated path)', () => {
      setCpu(mw, 95);
      expect(() => mw.use(fakeReq('/v1/priests'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sheds /v1/astrology', () => {
      setCpu(mw, 99);
      expect(() => mw.use(fakeReq('/v1/astrology/horoscope'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('sheds /v1/social', () => {
      setCpu(mw, 95);
      expect(() => mw.use(fakeReq('/v1/social'), fakeRes(), next))
        .toThrow(ServiceUnavailableException);
    });

    it('still allows /v1/auth at 99%', () => {
      setCpu(mw, 99);
      expect(() => mw.use(fakeReq('/v1/auth/me'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('still allows /health at 99%', () => {
      setCpu(mw, 99);
      expect(() => mw.use(fakeReq('/health'), fakeRes(), next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('does not set Retry-After for generic extreme load shed', () => {
      setCpu(mw, 95);
      const res = fakeRes();
      try { mw.use(fakeReq('/v1/priests'), res, next); } catch {}
      // setHeader for Retry-After is not called at ≥95 for non-NON_CRITICAL paths
      const retryCalls = res.setHeader.mock.calls.filter(
        ([h]: [string]) => h === 'Retry-After',
      );
      expect(retryCalls).toHaveLength(0);
    });
  });

  // ── next() is called only when request passes ─────────────────────────────

  it('does NOT call next() when request is shed', () => {
    setCpu(mw, 85);
    try { mw.use(fakeReq('/v1/analytics'), fakeRes(), next); } catch {}
    expect(next).not.toHaveBeenCalled();
  });
});
