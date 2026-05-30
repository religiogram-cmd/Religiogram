import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as open — JwtAuthGuard will skip. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
