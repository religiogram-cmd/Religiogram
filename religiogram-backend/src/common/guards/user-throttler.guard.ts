import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Per-user throttler.
 *
 * The default @nestjs/throttler keys on `req.ip`, which is correct for
 * pre-auth endpoints (send-otp, login). For authenticated endpoints we
 * want a per-USER cap — otherwise N users on a shared corporate/CGNAT
 * IP would exhaust one shared bucket between them.
 *
 * Extends the global ThrottlerGuard and overrides the tracker key:
 *   authed request → user.id
 *   unauthed       → ip (fallback, shouldn't happen on protected routes)
 *
 * Storage is inherited from the global config (Redis, shared across pods),
 * so the same 10/min bucket applies regardless of which pod handled the
 * request.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: string | undefined = req?.user?.id;
    if (userId) return `user:${userId}`;
    // Fallback — route missed an auth guard or got called anonymously.
    return `ip:${req?.ip ?? 'unknown'}`;
  }
}
