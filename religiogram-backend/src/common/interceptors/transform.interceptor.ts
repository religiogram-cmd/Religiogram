import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as crypto from 'crypto';
import { map } from 'rxjs/operators';

interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: { timestamp: string; requestId: string };
}

/**
 * Wraps every successful response in { success, data, meta }.
 * Pairs with HttpExceptionFilter for a uniform envelope.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T>> {
    const req = context.switchToHttp().getRequest();
    const requestId =
      (req.headers['x-request-id'] as string) ??
      crypto.randomBytes(8).toString('hex');

    return next.handle().pipe(
      map((data: T) => ({
        success: true as const,
        data,
        meta: { timestamp: new Date().toISOString(), requestId },
      } as ApiSuccess<T>)),
    );
  }
}
