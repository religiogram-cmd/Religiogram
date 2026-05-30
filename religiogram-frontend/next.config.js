/** @type {import('next').NextConfig} */

// Proxy `/api/v1/*` to the real NestJS backend. Defaults to the local
// docker-compose backend on :3001 (see RUNBOOK_LOCAL_DEV.md). Override with
// BACKEND_URL when running the frontend against a different environment.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Remove the Unsplash CDN allowlist by default — keep it only if explicitly
// opted-in. Production images come from our own S3/R2 bucket via the
// presign endpoints.
const ALLOW_UNSPLASH = process.env.NEXT_ALLOW_UNSPLASH === '1';

const nextConfig = {
  reactStrictMode: true,
  // Bundle perf: drop the `console.log` noise from prod bundles but keep
  // warnings + errors (those still bubble to Sentry).
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  // Browser cache shipping JS chunks for a year — every chunk has a content
  // hash in its filename, so cache-busting is automatic on deploy.
  poweredByHeader: false,
  images: {
    // Modern formats first; Next.js picks the smallest one the browser
    // accepts. AVIF can save 30–50% bytes vs JPEG on hero images.
    formats: ['image/avif', 'image/webp'],
    // Cache optimized images at the edge for 30 days. The Image component
    // adds content-hash query params so this is safe.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Default Next deviceSizes include 3840; ours don't need 4K — drop the
    // long tail to avoid generating huge unused variants on cold cache.
    deviceSizes: [320, 420, 540, 640, 750, 828, 1080, 1280, 1600],
    imageSizes: [16, 24, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      ...(ALLOW_UNSPLASH ? [{ protocol: 'https', hostname: 'images.unsplash.com' }] : []),
      // S3 / R2 buckets — wildcard by env so we don't hardcode prod URLs here.
      ...(process.env.NEXT_S3_CDN_HOST
        ? [{ protocol: 'https', hostname: process.env.NEXT_S3_CDN_HOST }]
        : []),
    ],
  },
  // 1-year immutable cache headers on static assets. Next.js content-hashes
  // every chunk + image variant, so cache-busting is automatic on deploy.
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|webp|avif|ico|woff|woff2|ttf|otf)',
        locale: false,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
