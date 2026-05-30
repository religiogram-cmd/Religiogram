import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';

/**
 * Request-scoped structured logger.
 *
 * Emits ONE JSON line per request/response in production. Shape is stable
 * so downstream shippers (CloudWatch / Loki / Datadog) can index every
 * field as-is:
 *
 *   {"lvl":"info","ev":"http","method":"POST","path":"/api/v1/auth/verify-otp",
 *    "status":200,"ms":42,"ip":"103.21.x.y","reqId":"abc123","userId":"..."}
 *
 * In non-prod we keep the Nest human-readable format so local tails remain
 * legible. Toggle is driven off NODE_ENV to keep the interceptor dependency-free
 * (no pino, no winston). At 1M users this is more than enough; a full pino
 * swap is a trivial later upgrade if per-field performance matters.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly isProd: boolean;

  constructor(private readonly config: ConfigService) {
    this.isProd = this.config.get<string>('app.env', 'development') === 'production';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req  = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      path: string;
      ip: string;
      user?: { id: string };
      headers: Record<string, string>;
    }>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          const ms  = Date.now() - start;

          if (this.isProd) {
            this.logger.log(
              JSON.stringify({
                lvl:    'info',
                ev:     'http',
                method: req.method,
                path:   req.path,
                status: res.statusCode,
                ms,
                ip:     req.ip,
                userId: req.user?.id,
              }),
            );
          } else {
            this.logger.log(
              `${req.method} ${req.path} ${res.statusCode} +${ms}ms`,
            );
          }
        },
        error: (err: { status?: number; message?: string }) => {
          const ms = Date.now() - start;
          if (this.isProd) {
            this.logger.warn(
              JSON.stringify({
                lvl:    'warn',
                ev:     'http_error',
                method: req.method,
                path:   req.path,
                status: err.status ?? 500,
                ms,
                ip:     req.ip,
                userId: req.user?.id,
                msg:    err.message,
              }),
            );
          } else {
            this.logger.warn(
              `${req.method} ${req.path} ${err.status ?? 500} +${ms}ms — ${err.message}`,
            );
          }
        },
      }),
    );
  }
}
