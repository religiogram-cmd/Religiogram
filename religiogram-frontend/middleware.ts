import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin route gate (edge middleware).
 *
 * Runs at the edge for every `/admin/*` request.
 *
 * ── Design ─────────────────────────────────────────────────────────────
 * The middleware is intentionally lightweight — it checks for the
 * PRESENCE of an auth token, not its cryptographic validity. Why:
 *
 *   1. Tokens are signed HS256 with a shared secret held only by the
 *      NestJS backend. Importing that secret into the Vercel edge
 *      runtime widens the blast radius unnecessarily.
 *
 *   2. The real security barrier lives on the backend:
 *      every /api/v1/admin/* endpoint runs through JwtAuthGuard +
 *      RolesGuard + @Roles('admin'). Backend rejects any request whose
 *      JWT is invalid, expired, or lacks the admin role — so even if
 *      the SPA shell loads, no admin data is fetched without a valid
 *      admin JWT.
 *
 *   3. The middleware's job here is UX: don't render the admin SPA
 *      shell to logged-out visitors (which would flash empty screens
 *      before the client-side auth check kicks in) and don't index
 *      admin routes.
 *
 * ── Behaviour ──────────────────────────────────────────────────────────
 *   - No token cookie/header  → redirect to `/auth?from=/admin/…`
 *   - Token present           → let the request through, backend enforces role
 *   - Non-prod                → pass through unconditionally (DevPanel + backend)
 */
export function middleware(req: NextRequest): NextResponse {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const isProd = process.env.NODE_ENV === 'production';

  // Non-prod: pass through — DevPanel handles auth, backend still enforces roles.
  if (!isProd) {
    return NextResponse.next();
  }

  // Check for token presence — cookie first (SPA sets it), then Authorization header.
  const token =
    req.cookies.get('rg_access_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    // No token — send them to sign in. Auth page is at `/auth` (not `/login`).
    // Preserve where they were trying to go so we can bounce them back after login.
    return NextResponse.redirect(
      new URL(`/auth?from=${encodeURIComponent(req.nextUrl.pathname)}`, req.url),
    );
  }

  // Token present — let the SPA render. Client-side and backend guard from here.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
