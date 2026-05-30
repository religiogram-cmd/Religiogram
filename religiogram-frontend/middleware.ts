import { NextResponse, type NextRequest } from 'next/server';

// In development without JWT_PUBLIC_KEY, bypass admin gate
// In production this gate is enforced with RS256 verification
export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
  
  // Dev mode: no key configured — allow through (DevPanel handles auth)
  if (!jwtPublicKey || process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  // Production: full RS256 verification
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
