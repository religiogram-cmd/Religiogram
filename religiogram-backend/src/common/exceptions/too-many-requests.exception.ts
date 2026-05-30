import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 Too Many Requests.
 * NestJS core doesn't ship a dedicated class for this status, so we define our own
 * to keep throw sites clean and readable.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message, error: 'Too Many Requests' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
