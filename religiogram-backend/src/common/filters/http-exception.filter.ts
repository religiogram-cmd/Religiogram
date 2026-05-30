import { ConfigService } from '@nestjs/config';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import * as crypto from 'crypto';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    path: string;
    requestId: string;
  };
}

/**
 * Global exception filter — produces a uniform error envelope.
 * Hides stack traces from clients in production but always logs server-side.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly config: ConfigService) {}
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof HttpException) {
      const httpEx = exception as HttpException;
      status = httpEx.getStatus();
      const res = httpEx.getResponse();
      if (typeof res === 'string') {
        message = res;
        code = this.statusToCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        // NestJS puts the human-readable message under `message` and the
        // short machine code under `error`. Some of our custom exceptions
        // set a domain-specific `code` field — honour it if present.
        if (Array.isArray(r.message)) {
          // class-validator errors come through as an array of strings.
          message = (r.message as string[]).join(', ');
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
        code =
          (r.code as string) ??
          (typeof r.error === 'string' ? r.error : undefined) ??
          this.statusToCode(status);
        details = r.details;
      } else {
        code = this.statusToCode(status);
      }
    } else if (exception instanceof Error) {
      // PostgreSQL statement_timeout (code 57014) → HTTP 504 Gateway Timeout.
      // This surfaces when a slow query hits our server-enforced cap.
      // We map it to 504 so load balancers and APM tools can distinguish
      // "app logic error" (500) from "DB overloaded" (504).
      const pgCode = (exception as Error & { code?: string }).code;
      if (pgCode === '57014') {
        status  = HttpStatus.GATEWAY_TIMEOUT;
        code    = 'DB_TIMEOUT';
        message = 'Request timed out. Please try again.';
      } else if (pgCode === '23505') {
        // unique_violation — map to 409 Conflict instead of 500
        status  = HttpStatus.CONFLICT;
        code    = 'DUPLICATE_ENTRY';
        message = 'A record with this value already exists.';
      } else if (pgCode === '23P01') {
        // v11 (GAP-2): exclusion_violation — booking slot already taken.
        status  = HttpStatus.CONFLICT;
        code    = 'SLOT_TAKEN';
        message = 'That time slot is no longer available. Please choose another.';
      } else if (pgCode === '23503') {
        // foreign_key_violation
        status  = HttpStatus.UNPROCESSABLE_ENTITY;
        code    = 'REFERENCE_NOT_FOUND';
        message = 'Referenced resource does not exist.';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    // For 5xx errors: capture in Sentry and never leak internal details to clients.
    if (status >= 500) {
      if (this.config.get<string>('sentry.dsn')) {
        Sentry.captureException(exception);
      }
      message = 'Something went wrong. Please try again.';
      details = undefined;
    }

    const requestId =
      (request.headers['x-request-id'] as string) ??
      crypto.randomBytes(8).toString('hex');

    const body: ErrorResponse = {
      success: false,
      error: { code, message, details },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId,
      },
    };

    response.status(status).json(body);
  }

  private statusToCode(status: number): string {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'UNPROCESSABLE_ENTITY',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_ERROR',
        503: 'SERVICE_UNAVAILABLE',
      }[status] ?? 'ERROR'
    );
  }
}
