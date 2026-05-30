import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request-ID middleware.
 *
 * Attaches a unique trace ID to every request BEFORE any guard, interceptor,
 * or service runs. This means:
 *   - Every structured log line can include the same ID
 *   - The client receives X-Request-Id in the response header for support tickets
 *   - The exception filter and transform interceptor pick it up from req.id
 *
 * Priority:
 *   1. Accept the caller's X-Request-Id if it looks like a UUID (so upstream
 *      services / APM agents that inject their own ID are preserved end-to-end)
 *   2. Otherwise generate a fresh UUID v4
 *
 * Applied as app.use() in main.ts — runs on EVERY request including health probes.
 */
export class RequestIdMiddleware {
  static middleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'] as string | undefined;
    const id =
      incoming && RequestIdMiddleware.isValidId(incoming)
        ? incoming
        : randomUUID();

    // Attach to request for downstream use (interceptors, filters, services).
    (req as Request & { id: string }).id = id;
    req.headers['x-request-id'] = id;

    // Echo back in the response so clients can correlate logs.
    res.setHeader('X-Request-Id', id);

    next();
  }

  private static isValidId(id: string): boolean {
    // Accept UUID v4 or any alphanumeric+dash string up to 64 chars.
    return /^[\w\-]{8,64}$/.test(id);
  }
}
