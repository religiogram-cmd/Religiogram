import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../redis/redis.service';

/**
 * Read-After-Write affinity middleware (plan P1-3).
 *
 * Problem: With a primary + read-replica setup, a client that PATCHes a
 * resource and immediately GETs it may hit the replica before replication
 * lag has cleared (typically 50-500 ms), and see stale data.
 *
 * Solution: After any write (POST / PUT / PATCH / DELETE), mark the user
 * as "recently wrote" in Redis for 5 seconds.  On subsequent reads, a
 * DataSource subscriber (or TypeORM resolver hook) can check this flag and
 * route the SELECT to the master.
 *
 * This middleware handles the *write* side — it sets the affinity flag after
 * a successful mutating response.  The READ side is handled by
 * ReadAffinitySubscriber (typeorm subscriber) and/or a custom TypeORM
 * DataSource factory that honours the flag.
 *
 * Redis key:  `rg:raw:{userId}`   value: `1`   TTL: 5 s
 *
 * The `rg:` prefix is prepended by RedisService's keyPrefix automatically,
 * so we store the logical key `raw:{userId}`.
 */
@Injectable()
export class ReadAffinityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ReadAffinityMiddleware.name);
  private static readonly WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  private static readonly TTL_SEC = 5;

  constructor(private readonly redis: RedisService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!ReadAffinityMiddleware.WRITE_METHODS.has(req.method)) {
      next();
      return;
    }

    // Hook into the response finish event so we only set the flag when the
    // write actually succeeded (2xx status).
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = (req as any).user?.id ?? (req as any).user?.sub;
        if (userId) {
          this.redis
            .setEx(`raw:${userId}`, ReadAffinityMiddleware.TTL_SEC, '1')
            .catch((err: Error) =>
              this.logger.warn(`read-affinity flag set failed for ${userId}: ${err.message}`),
            );
        }
      }
    });

    next();
  }
}
