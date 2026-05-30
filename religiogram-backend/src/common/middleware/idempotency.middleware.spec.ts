import { ConflictException } from '@nestjs/common';
import { IdempotencyMiddleware } from './idempotency.middleware';
import { RedisService } from '../../redis/redis.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<any> = {}): any {
  return {
    method:  'POST',
    path:    '/v1/wallet/debit',
    url:     '/v1/wallet/debit',
    headers: {},
    body:    { amount: 5000 },
    user:    { sub: 'user-1' },
    ...overrides,
  };
}

function makeRes(): any {
  const listeners: Record<string, Array<() => void>> = {};
  const res: any = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: undefined as unknown,
    setHeader: jest.fn((k: string, v: string) => { res._headers[k] = v; }),
    status:    jest.fn((code: number) => { res.statusCode = code; return res; }),
    json:      jest.fn((body: unknown) => { res._body = body; return res; }),
    on:        (event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    },
    emit: (event: string) => { (listeners[event] ?? []).forEach(fn => fn()); },
  };
  return res;
}

// ── mock Redis ────────────────────────────────────────────────────────────────

const mockRedis: Partial<RedisService> = {
  get:             jest.fn().mockResolvedValue(null),
  set:             jest.fn().mockResolvedValue('OK'),
  del:             jest.fn().mockResolvedValue(1),
  setIfNotExists:  jest.fn().mockResolvedValue(true),
  ttl:             jest.fn().mockResolvedValue(15),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('IdempotencyMiddleware', () => {
  let mw: IdempotencyMiddleware;
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    (mockRedis.setIfNotExists as jest.Mock).mockResolvedValue(true);
    mw = new IdempotencyMiddleware(mockRedis as RedisService);
  });

  // ── no header — pass through ───────────────────────────────────────────────

  it('calls next() immediately when no Idempotency-Key header is present', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await mw.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('calls next() for malformed key (too short / invalid chars)', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'bad' } });
    await mw.use(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  // ── first request — acquires lock and caches on finish ────────────────────

  it('acquires lock and calls next() on first request', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    await mw.use(req, res, next);
    expect(mockRedis.setIfNotExists).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('caches 2xx response in Redis on request finish', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    res.statusCode = 201;

    await mw.use(req, res, next);

    // Simulate response being sent
    res.json({ id: 'order-1' });
    res.emit('finish');

    // Lock should be released
    expect(mockRedis.del).toHaveBeenCalled();

    // Response should be cached
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('idem:cache:'),
      expect.stringContaining('"statusCode":201'),
      'EX',
      86400,
    );
  });

  it('does NOT cache 5xx responses', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    res.statusCode = 500;

    await mw.use(req, res, next);
    res.json({ error: 'internal server error' });
    res.emit('finish');

    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  // ── cache hit — replay ────────────────────────────────────────────────────

  it('replays cached response with Idempotent-Replayed: true header', async () => {
    const body = { id: 'tx-1', amount: 5000 };
    const bodyFingerprint = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({ amount: 5000 }))
      .digest('hex')
      .slice(0, 32);

    (mockRedis.get as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ statusCode: 201, body, bodyFingerprint }),
    );

    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    await mw.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._headers['Idempotent-Replayed']).toBe('true');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(body);
  });

  // ── body fingerprint mismatch — 422 ──────────────────────────────────────

  it('returns 422 when same key is submitted with a different request body', async () => {
    const differentFingerprint = 'aaaa' + '0'.repeat(28); // 32-char hex that won't match

    (mockRedis.get as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        statusCode: 200,
        body: { id: 'x' },
        bodyFingerprint: differentFingerprint,
      }),
    );

    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    await mw.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Idempotency conflict' }),
    );
    expect(res._headers['Idempotent-Replayed']).toBe('false');
    expect(next).not.toHaveBeenCalled();
  });

  // ── concurrent request — 409 ──────────────────────────────────────────────

  it('throws ConflictException (409) when lock is already held by in-flight request', async () => {
    (mockRedis.setIfNotExists as jest.Mock).mockResolvedValueOnce(false); // lock taken

    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();

    await expect(mw.use(req, res, next)).rejects.toThrow(ConflictException);
    expect(next).not.toHaveBeenCalled();
  });

  // ── lock released on finish ───────────────────────────────────────────────

  it('releases the lock key on request finish', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    const res = makeRes();
    await mw.use(req, res, next);
    res.json({ ok: true });
    res.emit('finish');

    expect(mockRedis.del).toHaveBeenCalledWith(
      expect.stringContaining('idem:lock:'),
    );
  });

  // ── anonymous user key isolation ─────────────────────────────────────────

  it('uses anon as userId when request has no user context', async () => {
    const req = makeReq({
      headers: { 'idempotency-key': 'key-12345678' },
      user: undefined,
    });
    await mw.use(req, makeRes(), next);

    const lockCall = (mockRedis.setIfNotExists as jest.Mock).mock.calls[0][0] as string;
    expect(lockCall).toContain('anon');
  });

  // ── bad cache entry — fall through ───────────────────────────────────────

  it('falls through to next() when cache entry is invalid JSON', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValueOnce('not-valid-json{{{');

    const req = makeReq({ headers: { 'idempotency-key': 'key-12345678' } });
    await mw.use(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
