import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';

/**
 * AdminPrefixGuard — defense-in-depth layer 2.
 *
 * Any request whose URL starts with `/v1/admin/` or `/v1/admin` must:
 *   1. Have an authenticated user (req.user populated by JwtAuthGuard).
 *   2. Have role === 'admin'.
 *
 * This guard fires regardless of whether individual controllers have
 * @Roles('admin') or @UseGuards decorators, providing a fail-closed
 * backstop against missing class-level decorators.
 *
 * Register globally via APP_GUARD in app.module.ts — it must run AFTER
 * JwtAuthGuard so req.user is already populated.
 *
 * Routes that are NOT under /v1/admin/* are passed through untouched.
 */
@Injectable()
export class AdminPrefixGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      url: string;
      user?: AuthenticatedUser;
    }>();

    // Only intercept admin-prefixed paths
    const url: string = request.url ?? '';
    if (!this.isAdminPath(url)) {
      return true;
    }

    // Admin path — user must be authenticated
    if (!request.user) {
      throw new UnauthorizedException('Authentication required for admin routes');
    }

    // User must have admin role
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }

    return true;
  }

  private isAdminPath(url: string): boolean {
    // Match /admin, /admin/, /v1/admin/, /v1/admin/anything, /v1/v1/admin/ (double-versioned)
    // A4: Match /admin/, /v1/admin/, and /v1/v1/admin/ (double-versioned routes)
    return /^\/(?:v\d+\/)?admin(\/|$)/.test(url);
  }
}
