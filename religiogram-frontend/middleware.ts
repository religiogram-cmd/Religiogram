import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin route middleware — pure pass-through.
 *
 * Previous versions tried to gate `/admin/*` at the edge by looking for a
 * JWT in a cookie. That doesn't work for us: the SPA stores its access
 * token in `localStorage['rg_access']` (managed by `lib/api.ts::tokenStore`),
 * which the edge runtime cannot read. The middleware ended up treating
 * logged-in admins as logged-out visitors and redirecting them to /auth,
 * which then bounced them back to /home because they WERE actually signed
 * in — an infinite-feeling loop that looked like "admin is broken".
 *
 * ── Where the real auth check lives ──────────────────────────────────
 *   1. Client-side: `app/admin/layout.tsx` reads tokenStore + localStorage,
 *      calls GET /users/me, and either renders the admin shell (role === 'admin'),
 *      redirects to /auth (no token / 401), or renders an "Access denied"
 *      panel (authenticated but not admin).
 *
 *   2. Backend: every /api/v1/admin/* route goes through JwtAuthGuard +
 *      RolesGuard + @Roles('admin'). Even if the SPA shell somehow rendered
 *      for a non-admin, the backend rejects every admin API call with 403.
 *
 * Both layers together are the real security barrier. This middleware is
 * intentionally a no-op so it can't create false negatives against them.
 * Keeping the file (rather than deleting it) so future changes can put
 * genuinely edge-only concerns here (e.g. bot filtering, geo blocking).
 */
export function middleware(_req: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  // Still scoped to /admin/* so Next's dev server has the same file present
  // even though we currently do nothing. Add other matchers here later if
  // an edge concern actually needs one.
  matcher: ['/admin/:path*'],
};
