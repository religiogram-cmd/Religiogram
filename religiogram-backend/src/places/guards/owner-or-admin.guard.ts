import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { PlaceClaimsService } from '../place-claims.service';

/**
 * OwnerOrAdminGuard — allows a request through if the authenticated user
 * is either:
 *   (a) role === 'admin'                — blanket access to every place
 *   (b) temples.owner_id === user.id    — scoped to this one place
 *
 * The guard reads the place id from `req.params.id`. Apply it AFTER
 * `JwtAuthGuard` so the user is already attached.
 *
 * Why not piggy-back on `RolesGuard`?
 *   Roles is role-based; ownership is instance-based. RolesGuard can only
 *   answer "is this user in role X?", not "does this user own THIS row?".
 *   Mixing the two responsibilities into one guard would make future
 *   instance checks (a moderator who only owns places in one city) messy.
 *
 * Cost: one point-select on `temples` for non-admins. That's one indexed
 * row read on the owner-edit hot path — cheap, and still O(1) per request.
 * Admins short-circuit before the DB read.
 */
@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  constructor(private readonly claimsService: PlaceClaimsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException('Auth required');

    const placeId: string | undefined = req.params?.id;
    if (!placeId) {
      // Developer error — guard applied to a route without an :id param.
      throw new ForbiddenException('Route missing place id');
    }

    try {
      const ok = await this.claimsService.canManagePlace(
        placeId,
        user.id,
        user.role,
      );
      if (!ok) {
        throw new ForbiddenException('You do not own this place');
      }
      return true;
    } catch (err) {
      // Re-throw NotFound as-is so the client sees a 404, not a 403, when
      // the place doesn't exist.
      if (err instanceof NotFoundException) throw err;
      if (err instanceof ForbiddenException) throw err;
      throw err;
    }
  }
}
