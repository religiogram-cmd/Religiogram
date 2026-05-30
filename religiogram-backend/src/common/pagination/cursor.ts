import { BadRequestException } from '@nestjs/common';

/**
 * P1-14 (v5): standardised keyset cursor for admin list endpoints.
 *
 * Encode the cursor as base64url of {d: ISODate, i: id}. Consumers should sort
 * by (createdAt DESC, id DESC) and apply:
 *   WHERE (created_at < :d OR (created_at = :d AND id < :i))
 *
 * Drop-in replacement for the existing OFFSET pagination in admin controllers.
 */
export interface KeysetCursor { d: string; i: string }

export function encodeCursor(date: Date, id: string): string {
  return Buffer.from(JSON.stringify({ d: date.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): KeysetCursor {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as KeysetCursor;
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}
