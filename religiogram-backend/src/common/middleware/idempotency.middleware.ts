import type { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware, ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';

interface CachedResponse {
  statusCode: number;
  body: unknown;
  bodyFingerprint: string;
}

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);
  private static readonly LOCK_TTL  = 60;
  private static readonly CACHE_TTL = 86_400;

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) return next();
    if (!/^[\w\-]{8,128}$/.test(idempotencyKey)) return next();

    const user = (req as any).user;
    const userId: string = user?.sub ?? user?.id ?? 'anon';
    const method = (req.method || 'GET').toUpperCase();
    const path = req.path || req.url || '';

    const cacheKey = `idem:cache:${userId}:${method}:${path}:${idempotencyKey}`;
    const lockKey  = `idem:lock:${userId}:${method}:${path}:${idempotencyKey}`;
    const bodyFingerprint = this.fingerprint(req.body ?? {});

    const cachedRaw = await this.redis.get(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as CachedResponse;
        if (cached.bodyFingerprint && cached.bodyFingerprint !== bodyFingerprint) {
          res.setHeader('Idempotent-Replayed', 'false');
          res.status(422).json({
            statusCode: 422,
            error: 'Idempotency conflict',
            message: 'A different request was already submitted with this Idempotency-Key',
          });
          return;
        }
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(cached.statusCode || 200).json(cached.body);
        return;
      } catch {
        // bad cache entry — fall through and re-execute
      }
    }

    const gotLock = await this.redis.setIfNotExists(
      lockKey,
      '1',
      IdempotencyMiddleware.LOCK_TTL,
    );
    if (!gotLock) {
      throw new ConflictException(
        'A request with this idempotency key is already being processed',
      );
    }

    let capturedBody: unknown = undefined;
    let captured = false;

    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    res.json = (body: unknown): Response => {
      capturedBody = body;
      captured = true;
      return originalJson(body);
    };

    res.on('finish', () => {
      this.redis.del(lockKey).catch(() => undefined);
      if (!captured || res.statusCode >= 500) return;
      const cached: CachedResponse = {
        statusCode: res.statusCode,
        body: capturedBody,
        bodyFingerprint,
      };
      this.redis
        .set(cacheKey, JSON.stringify(cached), 'EX', IdempotencyMiddleware.CACHE_TTL)
        .catch((err) =>
          this.logger.warn(`Idempotency cache write failed: ${(err as Error).message}`),
        );
    });

    next();
  }

  private fingerprint(body: unknown): string {
    try {
      const json = JSON.stringify(body, Object.keys(body as object).sort());
      return createHash('sha256').update(json).digest('hex').slice(0, 32);
    } catch {
      return 'unknown';
    }
  }
}
