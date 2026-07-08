import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin route gate.
 *
 * Runs at the edge for every `/admin/*` request. Two safety modes:
 *
 *  - Development (`NODE_ENV !== 'production'`):
 *      Pass through. The client-side DevPanel renders a login form and the
 *      backend still enforces role checks on every API call, so nothing
 *      sensitive is exposed by allowing the SPA shell to render.
 *
 *  - Production (`NODE_ENV === 'production'`):
 *      `JWT_PUBLIC_KEY` MUST be present. If it isn't, we FAIL CLOSED and
 *      redirect to /login rather than silently allowing the SPA to render.
 *      This is deliberate: the previous behaviour ("no key → allow through")
 *      meant a forgotten env var in prod would open the admin panel. The
 *      backend would still block API writes, but we don't want the admin UI
 *      to be reachable at all without a verified admin JWT.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const isProd = process.env.NODE_ENV === 'production';
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;

  // Non-prod: pass through — DevPanel handles auth, backend still enforces roles.
  if (!isProd) {
    return NextResponse.next();
  }

  // Prod without a configured key is a misconfiguration. Fail closed so the
  // admin UI cannot be reached until the env var is fixed.
  if (!jwtPublicKey) {
    console.error(
      '[middleware] JWT_PUBLIC_KEY missing in production — refusing to serve /admin/*',
    );
    return NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(req.nextUrl.pathname)}&reason=admin_gate_misconfig`, req.url),
    );
  }

  // Production: full RS256 verification.
  const { jwtVerify, importSPKI } = await import('jose');
  const ALG = 'RS256';
  const token =
    req.cookies.get('rg_access_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(req.nextUrl.pathname)}`, req.url),
    );
  }

  try {
    const pem = jwtPublicKey.replace(/\\n/g, '\n');
    const key = await importSPKI(pem, ALG);
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/home', req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(req.nextUrl.pathname)}`, req.url),
    );
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};
