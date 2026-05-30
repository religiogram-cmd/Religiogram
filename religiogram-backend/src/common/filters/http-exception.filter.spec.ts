import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHost(url = '/test/path', requestId?: string): any {
  const mockJson  = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const request: any = {
    url,
    headers: requestId ? { 'x-request-id': requestId } : {},
  };
  const response: any = { status: mockStatus };

  return {
    switchToHttp: () => ({
      getRequest:  () => request,
      getResponse: () => response,
    }),
    _response: response,
    _mockJson:  mockJson,
    _mockStatus: mockStatus,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  // ── HttpException mapping ──────────────────────────────────────────────────

  describe('HttpException → standard codes', () => {
    it('maps BadRequestException to 400 / BAD_REQUEST', () => {
      const host = makeHost();
      filter.catch(new BadRequestException('Invalid input'), host);
      expect(host._mockStatus).toHaveBeenCalledWith(400);
      const body = host._mockJson.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('Invalid input');
    });

    it('maps NotFoundException to 404 / NOT_FOUND', () => {
      const host = makeHost();
      filter.catch(new NotFoundException('Resource gone'), host);
      expect(host._mockStatus).toHaveBeenCalledWith(404);
      const body = host._mockJson.mock.calls[0][0];
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('maps UnauthorizedException to 401 / UNAUTHORIZED', () => {
      const host = makeHost();
      filter.catch(new UnauthorizedException(), host);
      expect(host._mockStatus).toHaveBeenCalledWith(401);
      const body = host._mockJson.mock.calls[0][0];
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('maps ForbiddenException to 403 / FORBIDDEN', () => {
      const host = makeHost();
      filter.catch(new ForbiddenException(), host);
      expect(host._mockStatus).toHaveBeenCalledWith(403);
      const body = host._mockJson.mock.calls[0][0];
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('maps ConflictException to 409 / CONFLICT', () => {
      const host = makeHost();
      filter.catch(new ConflictException('Already exists'), host);
      expect(host._mockStatus).toHaveBeenCalledWith(409);
      const body = host._mockJson.mock.calls[0][0];
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // ── validation error arrays ────────────────────────────────────────────────

  it('joins class-validator message arrays with ", "', () => {
    const host = makeHost();
    const ex = new BadRequestException({ message: ['email must be valid', 'phone is required'] });
    filter.catch(ex, host);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.message).toBe('email must be valid, phone is required');
  });

  // ── domain-specific code field ─────────────────────────────────────────────

  it('honours custom `code` field inside the exception response object', () => {
    const host = makeHost();
    const ex = new ConflictException({ code: 'TEMPLE_NEAR_DUPLICATE', message: 'Near dup' });
    filter.catch(ex, host);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('TEMPLE_NEAR_DUPLICATE');
  });

  // ── PostgreSQL error codes ─────────────────────────────────────────────────

  it('maps PG 57014 (statement_timeout) to 504 / DB_TIMEOUT', () => {
    const host = makeHost();
    const pgErr = Object.assign(new Error('canceling statement due to timeout'), { code: '57014' });
    filter.catch(pgErr, host);
    expect(host._mockStatus).toHaveBeenCalledWith(504);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('DB_TIMEOUT');
  });

  it('maps PG 23505 (unique_violation) to 409 / DUPLICATE_ENTRY', () => {
    const host = makeHost();
    const pgErr = Object.assign(new Error('unique constraint'), { code: '23505' });
    filter.catch(pgErr, host);
    expect(host._mockStatus).toHaveBeenCalledWith(409);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('DUPLICATE_ENTRY');
  });

  it('maps PG 23503 (foreign_key_violation) to 422 / REFERENCE_NOT_FOUND', () => {
    const host = makeHost();
    const pgErr = Object.assign(new Error('fk violation'), { code: '23503' });
    filter.catch(pgErr, host);
    expect(host._mockStatus).toHaveBeenCalledWith(422);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('REFERENCE_NOT_FOUND');
  });

  // ── 5xx sanitisation ──────────────────────────────────────────────────────

  it('sanitises 5xx error messages to generic string (no internal details)', () => {
    const host = makeHost();
    filter.catch(new Error('DB connection pool exhausted — internal detail'), host);
    expect(host._mockStatus).toHaveBeenCalledWith(500);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.message).toBe('Something went wrong. Please try again.');
    expect(body.error.message).not.toContain('pool');
  });

  it('never exposes details field on 5xx', () => {
    const host = makeHost();
    filter.catch(new Error('boom'), host);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.error.details).toBeUndefined();
  });

  // ── response envelope ─────────────────────────────────────────────────────

  it('response envelope always contains success:false, meta.timestamp, meta.path', () => {
    const host = makeHost('/api/v1/things', 'req-abc');
    filter.catch(new NotFoundException(), host);
    const body = host._mockJson.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.meta.path).toBe('/api/v1/things');
    expect(body.meta.requestId).toBe('req-abc');
    expect(typeof body.meta.timestamp).toBe('string');
  });

  it('generates a requestId when x-request-id header is absent', () => {
    const host = makeHost('/path');
    filter.catch(new NotFoundException(), host);
    const body = host._mockJson.mock.calls[0][0];
    expect(typeof body.meta.requestId).toBe('string');
    expect(body.meta.requestId.length).toBeGreaterThan(0);
  });
});
