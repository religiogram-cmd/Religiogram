import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

/**
 * SecurityHeadersMiddleware — production-grade HTTP security headers.
 *
 *   HSTS          2 years, includeSubDomains, preload-eligible
 *   CSP           strict allowlist; no unsafe-eval in production
 *   COOP          Cross-Origin-Opener-Policy: same-origin
 *                 Isolates browsing context; prevents cross-origin window.opener access.
 *   COEP          Cross-Origin-Embedder-Policy: credentialless
 *                 Enables cross-origin isolation without requiring CORP on every sub-resource.
 *   CORP          Cross-Origin-Resource-Policy: same-site
 *                 Prevents other origins from reading our API responses.
 *   X-Content-Type-Options   nosniff
 *   X-Frame-Options          DENY (belt+suspenders alongside CSP frame-ancestors)
 *   Referrer-Policy          strict-origin-when-cross-origin
 *   Permissions-Policy       deny camera/mic/payment/tracking APIs
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly isProd: boolean;

  constructor(private readonly config: ConfigService) {
    this.isProd = this.config.get<string>('app.env', 'development') === 'production';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const isProd = this.isProd;

    // ── HSTS — 2 years; preload-eligible ──────────────────────────────────
    // Only set in production — HSTS over plain HTTP breaks local dev.
    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload',
      );
    }

    // ── CSP — production tightened, dev relaxed for HMR/devtools ──────────
    const cspDirectives = isProd
      ? [
          "default-src 'self'",
          "script-src 'self' https://checkout.razorpay.com https://*.razorpay.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
          "font-src 'self' data:",
          "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
          "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com wss: https://*.r2.cloudflarestorage.com",
          "form-action 'self' https://api.razorpay.com",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "upgrade-insecure-requests",
        ]
      : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // dev HMR needs eval
          "style-src 'self' 'unsafe-inline'",
          "img-src * data: blob:",
          "connect-src * wss:",
          "frame-ancestors 'none'",
        ];

    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    // ── COOP — isolate browsing context from cross-origin openers ─────────
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // ── COEP — credentialless mode (compatible with Razorpay/R2 CDN) ──────
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

    // ── CORP — prevent other origins from reading our API responses ────────
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    // ── MIME sniffing prevention ──────────────────────────────────────────
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ── Clickjacking — belt + suspenders alongside CSP frame-ancestors ────
    res.setHeader('X-Frame-Options', 'DENY');

    // ── Referrer — expose origin, not full URL, on cross-origin requests ──
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // ── Permissions — deny sensitive APIs not needed by this service ───────
    res.setHeader(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=(self)',
        'payment=(self "https://api.razorpay.com")',  // P2 (v4): include Razorpay iframe origin
        'usb=()',
        'bluetooth=()',
        'accelerometer=()',
        'gyroscope=()',
        'magnetometer=()',
        'interest-cohort=()',     // disable FLoC / Privacy Sandbox ad tracking
      ].join(', '),
    );

    // ── Remove fingerprinting headers ──────────────────────────────────────
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
  }
}
