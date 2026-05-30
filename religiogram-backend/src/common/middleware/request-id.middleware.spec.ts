import { RequestIdMiddleware } from './request-id.middleware';

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeReq(xRequestId?: string): any {
  return {
    headers: xRequestId ? { 'x-request-id': xRequestId } : {},
  };
}

function fakeRes(): any {
  return { setHeader: jest.fn() };
}

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RequestIdMiddleware', () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  // ── ID propagation ────────────────────────────────────────────────────────

  describe('when X-Request-Id header is a valid UUID', () => {
    const validId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    it('preserves the incoming ID on req.id', () => {
      const req = fakeReq(validId);
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(req.id).toBe(validId);
    });

    it('echoes the incoming ID in the response header', () => {
      const req = fakeReq(validId);
      const res = fakeRes();
      RequestIdMiddleware.middleware(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', validId);
    });

    it('keeps the normalised ID in req.headers["x-request-id"]', () => {
      const req = fakeReq(validId);
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(req.headers['x-request-id']).toBe(validId);
    });
  });

  describe('when X-Request-Id header is absent', () => {
    it('generates a fresh UUID v4 for req.id', () => {
      const req = fakeReq();
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(UUID_RE.test(req.id)).toBe(true);
    });

    it('sets X-Request-Id response header to the generated id', () => {
      const req = fakeReq();
      const res = fakeRes();
      RequestIdMiddleware.middleware(req, res, next);
      const [, id] = res.setHeader.mock.calls[0];
      expect(UUID_RE.test(id)).toBe(true);
    });
  });

  describe('when X-Request-Id is too short / invalid', () => {
    it('generates a new UUID for a 3-character id', () => {
      const req = fakeReq('abc');
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(UUID_RE.test(req.id)).toBe(true);
    });

    it('generates a new UUID for an ID longer than 64 chars', () => {
      const req = fakeReq('a'.repeat(65));
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(UUID_RE.test(req.id)).toBe(true);
    });

    it('generates a new UUID for an ID with special characters', () => {
      const req = fakeReq('hello world!');
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(UUID_RE.test(req.id)).toBe(true);
    });
  });

  describe('when X-Request-Id is a valid non-UUID alphanumeric string', () => {
    it('accepts an 8-char alphanumeric custom trace ID', () => {
      const req = fakeReq('trace-99');
      RequestIdMiddleware.middleware(req, fakeRes(), next);
      expect(req.id).toBe('trace-99');
    });
  });

  // ── next() called ─────────────────────────────────────────────────────────

  it('calls next() in all cases', () => {
    RequestIdMiddleware.middleware(fakeReq('some-id'), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // ── uniqueness ────────────────────────────────────────────────────────────

  it('generates a different UUID on each request', () => {
    const req1 = fakeReq();
    const req2 = fakeReq();
    RequestIdMiddleware.middleware(req1, fakeRes(), next);
    RequestIdMiddleware.middleware(req2, fakeRes(), next);
    expect(req1.id).not.toBe(req2.id);
  });
});
