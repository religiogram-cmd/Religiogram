import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Response } from 'express';

export const CACHE_CONTROL_KEY = 'cache_control';

/**
 * @CacheControl(directive)
 *
 * Decorator that sets a Cache-Control directive on a route or controller.
 *
 * Usage:
 *   @CacheControl('public, max-age=30, stale-while-revalidate=60')
 *   @Get(':id')
 *   getProviderProfile(...) { ... }
 *
 * Standard directives:
 *   Public,  cacheable by CDN/browser:
 *     'public, max-age=30, stale-while-revalidate=60'     provider/place reads (30s fresh)
 *     'public, max-age=300, stale-while-revalidate=3600'  catalog / religion config (5 min)
 *
 *   Private, not cacheable by CDN:
 *     'private, max-age=10'                               user-specific but not secret
 *
 *   No caching (authenticated writes, wallet, bookings):
 *     'no-store'                                          the default when no decorator
 */
export const CacheControl = (directive: string) =>
  SetMetadata(CACHE_CONTROL_KEY, directive);

/**
 * Global interceptor that:
 *   1. Reads the @CacheControl() directive from the route metadata.
 *   2. Sets the header on the response once the handler completes.
 *   3. Falls back to 'no-store' for any route without the decorator.
 *
 * Why do this in an interceptor instead of a middleware?
 *   Interceptors run after guards and pipes, so they see the resolved
 *   route and can read route-level metadata. Middleware runs before
 *   routing and cannot.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const directive =
      this.reflector.getAllAndOverride<string>(CACHE_CONTROL_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? 'no-store';

    const res = ctx.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        // Only set the header if it hasn't already been set by the handler
        if (!res.headersSent && !res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', directive);
        }
      }),
    );
  }
}
